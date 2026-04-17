import { v4 as uuidv4 } from 'uuid';
import {
  generateLegacyShareCodesForOwnedShockers,
  getAllowedShockersForController,
  getGeneratedShareCodeForShocker,
  getPreferredOwnedShockers,
  normalizeGeneratedShareCodes,
  operatePiShockShareCode,
} from '../../_shared/pishock-client';
import { getControllerPlusState } from '../../_shared/discord-entitlements';
import { ACTIVITY_BATCH_KV_TTL_SECONDS } from '../../_shared/activity-batch-kv';
import { validateDiscordTokenWithRefresh } from '../../_shared/token-utils';

interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_BOT_TOKEN?: string;
}

interface ActivityLogEntry {
  id: string;
  timestamp: string;
  instanceId: string;
  executorUserId: string;
  executorUsername: string;
  targetUserId: string;
  targetUsername: string;
  action: 'shock' | 'vibrate' | 'beep';
  intensity: number;
  duration: number;
}

type MultishockFailure = { targetUserId: string; error: string; shockerId?: string };

function jsonResponse(body: any, status = 200, additionalHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...additionalHeaders,
    },
  });
}

function createPerformanceHeaders(
  startedAtMs: number,
  kvReads: number,
  kvWrites: number,
  stageDurationMs: number
): Record<string, string> {
  const totalMs = Math.max(0, Date.now() - startedAtMs);
  return {
    'X-Response-Time-Ms': String(totalMs),
    'X-KV-Reads-Estimate': String(kvReads),
    'X-KV-Writes-Estimate': String(kvWrites),
    'Server-Timing': `app;dur=${totalMs},multishock;dur=${Math.max(0, stageDurationMs)}`,
  };
}

function requireAuth(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

async function validateDiscordToken(token: string, kv: KVNamespace): Promise<any> {
  return validateDiscordTokenWithRefresh(token, kv, {
    PISHOCK_KV: kv,
    DISCORD_CLIENT_ID: '',
    DISCORD_CLIENT_SECRET: '',
  });
}

async function decrypt(encryptedData: string): Promise<any> {
  return JSON.parse(atob(encryptedData));
}

async function addToActivityBatch(kv: KVNamespace, entry: ActivityLogEntry) {
  const date = new Date(entry.timestamp).toISOString().split('T')[0];
  const batchKey = `activity:batch:${date}`;
  const batch = await kv.get(batchKey);
  const batchData = batch ? JSON.parse(batch) : { entries: [], lastUpdated: entry.timestamp, totalCount: 0 };
  batchData.entries.unshift(entry);
  batchData.lastUpdated = entry.timestamp;
  batchData.totalCount++;
  if (batchData.entries.length > 500) batchData.entries = batchData.entries.slice(0, 500);
  await kv.put(batchKey, JSON.stringify(batchData), { expirationTtl: ACTIVITY_BATCH_KV_TTL_SECONDS });
}

async function getCachedDisplayName(kv: KVNamespace, userId: string): Promise<string> {
  const cached = await kv.get(`discord_user:${userId}`);
  if (!cached) return 'Unknown User';
  const user = JSON.parse(cached);
  return user.global_name || user.username || 'Unknown User';
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      results.push(await worker(item));
    }
  });
  await Promise.all(workers);
  return results;
}

export const onRequest = async (context: { request: Request; env: Env; params: Record<string, string> }): Promise<Response> => {
  const { request, env, params } = context;
  const instanceId = params.instanceId;
  const startedAtMs = Date.now();
  let stageStartedAtMs = 0;
  let kvReads = 0;
  let kvWrites = 0;
  const trackedKv: KVNamespace = {
    get: async (key: string) => {
      kvReads += 1;
      return env.PISHOCK_KV.get(key);
    },
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      kvWrites += 1;
      return env.PISHOCK_KV.put(key, value, options);
    },
    delete: async (key: string) => {
      kvWrites += 1;
      return env.PISHOCK_KV.delete(key);
    },
  };

  const respond = (body: any, status = 200, headers: Record<string, string> = {}) =>
    jsonResponse(body, status, {
      ...headers,
      ...createPerformanceHeaders(
        startedAtMs,
        kvReads,
        kvWrites,
        stageStartedAtMs > 0 ? Date.now() - stageStartedAtMs : 0
      ),
    });

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const token = requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });
  const user = await validateDiscordToken(token, trackedKv);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    stageStartedAtMs = Date.now();
    const { executorUserId, targets, intensity, duration, operation } = await request.json() as {
      executorUserId: string;
      targets: Array<{ userId: string; shockerIds?: string[] }>;
      intensity: number;
      duration: number;
      operation: number;
    };

    if (!executorUserId || user.id !== executorUserId) {
      return respond({ success: false, error: 'Executor mismatch.' }, 403);
    }
    if (!Array.isArray(targets) || targets.length === 0) {
      return respond({ success: false, error: 'At least one target is required.' }, 400);
    }
    if (intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return respond({ success: false, error: 'Invalid parameters.' }, 400);
    }

    const entitlementState = await getControllerPlusState(env, executorUserId);
    if (!entitlementState.hasControllerPlus) {
      return respond({ success: false, error: 'Controller+ entitlement is required for multishock.' }, 403);
    }

    const instanceDataRaw = await trackedKv.get(`instance_data:${instanceId}`);
    let instanceData: Record<string, unknown> = {};
    try {
      instanceData = instanceDataRaw ? (JSON.parse(instanceDataRaw) as Record<string, unknown>) : {};
    } catch {
      instanceData = {};
    }
    const participantIdsRaw = instanceData.activityParticipantIds;
    const participantIds = new Set(
      Array.isArray(participantIdsRaw) ? participantIdsRaw.map((id) => String(id)) : []
    );
    if (participantIds.size === 0) {
      return respond(
        {
          success: false,
          error: 'No activity participant snapshot; refresh participants in the app.',
        },
        403
      );
    }
    if (!participantIds.has(String(executorUserId))) {
      return respond({ success: false, error: 'Executor is not part of this activity session.' }, 403);
    }
    for (const target of targets) {
      if (!participantIds.has(String(target.userId))) {
        return respond(
          { success: false, error: `User ${target.userId} is not in this activity session.` },
          403
        );
      }
    }

    const prepResults = await mapWithConcurrency(targets, 4, async (target) => {
      const failures: MultishockFailure[] = [];
      const targetUserDataStr = await trackedKv.get(`user:${target.userId}:data`);
      if (!targetUserDataStr) {
        failures.push({
          targetUserId: target.userId,
          error: 'Target has no configured PiShock settings.',
        });
        return { failures };
      }

      let targetUserData: { credentials: string; bannedExecutors?: string[]; commandsPaused?: boolean };
      try {
        targetUserData = JSON.parse(targetUserDataStr);
      } catch {
        failures.push({ targetUserId: target.userId, error: 'Invalid stored user data.' });
        return { failures };
      }
      if ((targetUserData.bannedExecutors || []).includes(executorUserId)) {
        failures.push({ targetUserId: target.userId, error: 'Target has blocked this executor.' });
        return { failures };
      }
      if (targetUserData.commandsPaused) {
        failures.push({ targetUserId: target.userId, error: 'Target has paused incoming commands.' });
        return { failures };
      }

      let creds: any;
      try {
        creds = await decrypt(targetUserData.credentials);
      } catch {
        failures.push({ targetUserId: target.userId, error: 'Unable to decrypt PiShock credentials.' });
        return { failures };
      }

      const selectedShockerId = creds.selectedShockerId || creds.shockerId;
      const allowed = Array.isArray(creds.allowedShockerIds) ? creds.allowedShockerIds.map((id: any) => String(id)) : [];
      const effectiveAllowed = allowed.length > 0 ? allowed : selectedShockerId ? [String(selectedShockerId)] : [];
      const targetCredentials = {
        apiKey: creds.apiKey,
        username: creds.username,
        piShockUserId: creds.piShockUserId,
      };
      const allowedResult = await getAllowedShockersForController(targetCredentials);
      if (!allowedResult.ok || !allowedResult.data) {
        failures.push({
          targetUserId: target.userId,
          error: allowedResult.error || 'Unable to verify allowed shockers for target.',
        });
        return { failures };
      }

      const preferredShockers = getPreferredOwnedShockers(allowedResult.data);
      const ownedShockerIds = new Set(
        preferredShockers
          .filter((shocker: any) => shocker?.ShockerId !== undefined && shocker?.ShockerId !== null)
          .map((shocker: any) => String(shocker.ShockerId))
      );
      const shockersById = new Map(
        preferredShockers
          .filter((shocker: any) => shocker?.ShockerId !== undefined && shocker?.ShockerId !== null)
          .map((shocker: any) => [String(shocker.ShockerId), shocker])
      );
      const requestedShockers =
        Array.isArray(target.shockerIds) && target.shockerIds.length > 0
          ? target.shockerIds.map((id) => String(id))
          : effectiveAllowed;
      const invalidRequested = requestedShockers.filter((id) => !effectiveAllowed.includes(id));
      if (invalidRequested.length > 0) {
        failures.push({
          targetUserId: target.userId,
          error: `Shocker IDs not allowed for this target: ${invalidRequested.join(', ')}.`,
        });
        return { failures };
      }
      const normalizedShockers = requestedShockers.filter((id) => effectiveAllowed.includes(id) && ownedShockerIds.has(id));
      if (normalizedShockers.length === 0) {
        failures.push({
          targetUserId: target.userId,
          error: 'No allowed shockers for multishock.',
        });
        return { failures };
      }

      for (const shockerId of normalizedShockers) {
        const shocker = shockersById.get(shockerId);
        if (!shocker) {
          failures.push({
            targetUserId: target.userId,
            shockerId,
            error: `Unable to load context for shocker ${shockerId}.`,
          });
          return { failures };
        }
        if (operation === 0 && !shocker.CanShock) {
          failures.push({ targetUserId: target.userId, shockerId, error: `Shocker ${shockerId} does not support shock.` });
          return { failures };
        }
        if (operation === 1 && !shocker.CanVibrate) {
          failures.push({ targetUserId: target.userId, shockerId, error: `Shocker ${shockerId} does not support vibrate.` });
          return { failures };
        }
        if (operation === 2 && !shocker.CanBeep) {
          failures.push({ targetUserId: target.userId, shockerId, error: `Shocker ${shockerId} does not support beep.` });
          return { failures };
        }

        let effectiveMaxIntensity = Number(creds.maxIntensity) || 100;
        const apiMaxIntensity = Number(shocker.MaxIntensity);
        if (Number.isFinite(apiMaxIntensity) && apiMaxIntensity > 0) {
          effectiveMaxIntensity = Math.min(effectiveMaxIntensity, Math.floor(apiMaxIntensity));
        }

        let effectiveMaxDuration = Number(creds.maxDuration) || 15;
        const apiMaxDurationMs = Number(shocker.MaxDuration);
        if (Number.isFinite(apiMaxDurationMs) && apiMaxDurationMs > 0) {
          effectiveMaxDuration = Math.min(effectiveMaxDuration, Math.max(1, Math.floor(apiMaxDurationMs / 1000)));
        }

        if (intensity > effectiveMaxIntensity || duration > effectiveMaxDuration) {
          failures.push({
            targetUserId: target.userId,
            shockerId,
            error: `Exceeds limits for this shocker (max ${effectiveMaxIntensity}% / ${effectiveMaxDuration}s).`,
          });
          return { failures };
        }
      }

      let generatedShareCodes = normalizeGeneratedShareCodes(creds.generatedShareCodes);
      const missingCodeIds = normalizedShockers.filter((id) => !getGeneratedShareCodeForShocker(generatedShareCodes, id));
      if (missingCodeIds.length > 0) {
        const generatedShareCodesResult = await generateLegacyShareCodesForOwnedShockers(
          targetCredentials,
          missingCodeIds
        );
        const merged = {
          ...generatedShareCodes,
          ...(generatedShareCodesResult.data
            ? normalizeGeneratedShareCodes(generatedShareCodesResult.data)
            : {}),
        };
        const stillMissing = normalizedShockers.find((id) => !getGeneratedShareCodeForShocker(merged, id));
        if (stillMissing) {
          failures.push({
            targetUserId: target.userId,
            shockerId: stillMissing,
            error: generatedShareCodesResult.error || `Shocker ${stillMissing} has no generated sharecode.`,
          });
          return { failures };
        }
        generatedShareCodes = merged;
        creds.generatedShareCodes = generatedShareCodes;
        creds.generatedShareCodesLastUpdated = new Date().toISOString();
        targetUserData.credentials = btoa(JSON.stringify(creds));
        await trackedKv.put(`user:${target.userId}:data`, JSON.stringify(targetUserData));
      }

      const shareCodesByShockerId: Record<string, string> = {};
      for (const shockerId of normalizedShockers) {
        const shareCode = getGeneratedShareCodeForShocker(generatedShareCodes, shockerId);
        if (!shareCode) {
          failures.push({
            targetUserId: target.userId,
            shockerId,
            error: `Shocker ${shockerId} has no generated sharecode.`,
          });
          return { failures };
        }
        shareCodesByShockerId[shockerId] = shareCode;
      }

      return {
        failures,
        prepared: {
          targetUserId: target.userId,
          targetName: await getCachedDisplayName(trackedKv, target.userId),
          credentials: targetCredentials,
          shockerIds: normalizedShockers,
          shareCodesByShockerId,
        },
      };
    });

    const prepFailures = prepResults.flatMap((result) => result.failures);
    const prepared = prepResults.flatMap((result) => (result.prepared ? [result.prepared] : []));

    if (prepared.length === 0) {
      return respond(
        {
          success: false,
          partialSuccess: false,
          targetCount: 0,
          failures: prepFailures,
          overLimitAllowed: false,
        },
        400
      );
    }

    const operationName = ['shock', 'vibrate', 'beep'][operation] as 'shock' | 'vibrate' | 'beep';
    const executionResults = await Promise.all(
      prepared.map(async (target) => {
        const operations = await Promise.all(
          target.shockerIds.map(async (shockerId) => {
            const result = await operatePiShockShareCode(
              target.credentials,
              target.shareCodesByShockerId[shockerId],
              {
                operation,
                intensity,
                durationSeconds: duration,
                agentName: 'DiscordActivityMultishock',
              }
            );
            return { shockerId, result };
          })
        );
        return { target, operations };
      })
    );

    const execFailures: MultishockFailure[] = executionResults.flatMap((entry) =>
      entry.operations
        .filter((operationResult) => !operationResult.result.ok)
        .map((operationResult) => ({
          targetUserId: entry.target.targetUserId,
          shockerId: operationResult.shockerId,
          error: operationResult.result.error || 'Unknown execution error',
        }))
    );

    const executorName = await getCachedDisplayName(trackedKv, executorUserId);
    const successfulEntries = executionResults.filter((entry) =>
      entry.operations.every((op) => op.result.ok)
    );
    await Promise.all(
      successfulEntries.map(async ({ target }) => {
        await addToActivityBatch(trackedKv, {
          id: uuidv4(),
          timestamp: new Date().toISOString(),
          instanceId,
          executorUserId,
          executorUsername: executorName,
          targetUserId: target.targetUserId,
          targetUsername: target.targetName,
          action: operationName,
          intensity,
          duration,
        });
      })
    );

    const allFailures = [...prepFailures, ...execFailures];
    const status = allFailures.length > 0 ? 207 : 200;

    return respond(
      {
        success: allFailures.length === 0,
        partialSuccess: allFailures.length > 0,
        targetCount: prepared.length,
        operationCount: executionResults.reduce((total, item) => total + item.operations.length, 0),
        failures: allFailures,
        overLimitAllowed: false,
      },
      status
    );
  } catch (error) {
    return respond(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      500
    );
  }
};
