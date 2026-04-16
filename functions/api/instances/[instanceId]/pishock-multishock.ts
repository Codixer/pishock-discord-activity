import { v4 as uuidv4 } from 'uuid';
import {
  generateLegacyShareCodesForOwnedShockers,
  getAllowedShockersForController,
  getGeneratedShareCodeForShocker,
  normalizeGeneratedShareCodes,
  operatePiShockShareCode,
} from '../../_shared/pishock-client';
import { getControllerPlusState } from '../../_shared/discord-entitlements';
import { ACTIVITY_BATCH_KV_TTL_SECONDS } from '../../_shared/activity-batch-kv';

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

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function requireAuth(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

async function validateDiscordToken(token: string, kv: KVNamespace): Promise<any> {
  const cacheKey = `discord_token_validation:${token.slice(-8)}`;
  const cached = await kv.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const response = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const userData = await response.json();
  await kv.put(cacheKey, JSON.stringify(userData), { expirationTtl: 3600 });
  return userData;
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

export const onRequest = async (context: { request: Request; env: Env; params: Record<string, string> }): Promise<Response> => {
  const { request, env, params } = context;
  const instanceId = params.instanceId;

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
  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    const { executorUserId, targets, intensity, duration, operation } = await request.json() as {
      executorUserId: string;
      targets: Array<{ userId: string; shockerIds?: string[] }>;
      intensity: number;
      duration: number;
      operation: number;
    };

    if (!executorUserId || user.id !== executorUserId) {
      return jsonResponse({ success: false, error: 'Executor mismatch.' }, 403);
    }
    if (!Array.isArray(targets) || targets.length === 0) {
      return jsonResponse({ success: false, error: 'At least one target is required.' }, 400);
    }
    if (intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ success: false, error: 'Invalid parameters.' }, 400);
    }

    const entitlementState = await getControllerPlusState(env, executorUserId);
    if (!entitlementState.hasControllerPlus) {
      return jsonResponse({ success: false, error: 'Controller+ entitlement is required for multishock.' }, 403);
    }

    const instanceDataRaw = await env.PISHOCK_KV.get(`instance_data:${instanceId}`);
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
      return jsonResponse(
        {
          success: false,
          error: 'No activity participant snapshot; refresh participants in the app.',
        },
        403
      );
    }
    if (!participantIds.has(String(executorUserId))) {
      return jsonResponse({ success: false, error: 'Executor is not part of this activity session.' }, 403);
    }
    for (const target of targets) {
      if (!participantIds.has(String(target.userId))) {
        return jsonResponse(
          { success: false, error: `User ${target.userId} is not in this activity session.` },
          403
        );
      }
    }

    const prepFailures: MultishockFailure[] = [];

    const prepared: Array<{
      targetUserId: string;
      targetName: string;
      credentials: { apiKey: string; username: string; piShockUserId?: string };
      shockerIds: string[];
      shareCodesByShockerId: Record<string, string>;
    }> = [];

    for (const target of targets) {
      const targetUserDataStr = await env.PISHOCK_KV.get(`user:${target.userId}:data`);
      if (!targetUserDataStr) {
        prepFailures.push({
          targetUserId: target.userId,
          error: 'Target has no configured PiShock settings.',
        });
        continue;
      }
      let targetUserData: { credentials: string; bannedExecutors?: string[]; commandsPaused?: boolean };
      try {
        targetUserData = JSON.parse(targetUserDataStr);
      } catch {
        prepFailures.push({ targetUserId: target.userId, error: 'Invalid stored user data.' });
        continue;
      }
      if ((targetUserData.bannedExecutors || []).includes(executorUserId)) {
        prepFailures.push({ targetUserId: target.userId, error: 'Target has blocked this executor.' });
        continue;
      }
      if (targetUserData.commandsPaused) {
        prepFailures.push({ targetUserId: target.userId, error: 'Target has paused incoming commands.' });
        continue;
      }
      let creds: any;
      try {
        creds = await decrypt(targetUserData.credentials);
      } catch {
        prepFailures.push({ targetUserId: target.userId, error: 'Unable to decrypt PiShock credentials.' });
        continue;
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
        prepFailures.push({
          targetUserId: target.userId,
          error: allowedResult.error || 'Unable to verify allowed shockers for target.',
        });
        continue;
      }
      const ownedShockerIds = new Set(
        allowedResult.data.allowedShockers
          .filter((shocker: any) => shocker?.ShockerId !== undefined && shocker?.ShockerId !== null)
          .map((shocker: any) => String(shocker.ShockerId))
      );
      const shockersById = new Map(
        allowedResult.data.allowedShockers
          .filter((shocker: any) => shocker?.ShockerId !== undefined && shocker?.ShockerId !== null)
          .map((shocker: any) => [String(shocker.ShockerId), shocker])
      );
      const requestedShockers =
        Array.isArray(target.shockerIds) && target.shockerIds.length > 0
          ? target.shockerIds.map((id) => String(id))
          : effectiveAllowed;
      const invalidRequested = requestedShockers.filter((id) => !effectiveAllowed.includes(id));
      if (invalidRequested.length > 0) {
        prepFailures.push({
          targetUserId: target.userId,
          error: `Shocker IDs not allowed for this target: ${invalidRequested.join(', ')}.`,
        });
        continue;
      }
      const normalizedShockers = requestedShockers.filter((id) => effectiveAllowed.includes(id) && ownedShockerIds.has(id));

      if (normalizedShockers.length === 0) {
        prepFailures.push({
          targetUserId: target.userId,
          error: 'No allowed shockers for multishock.',
        });
        continue;
      }

      let shockerValidationFailed = false;
      for (const shockerId of normalizedShockers) {
        const shocker = shockersById.get(shockerId);
        if (!shocker) {
          prepFailures.push({
            targetUserId: target.userId,
            shockerId,
            error: `Unable to load context for shocker ${shockerId}.`,
          });
          shockerValidationFailed = true;
          break;
        }
        if (operation === 0 && !shocker.CanShock) {
          prepFailures.push({
            targetUserId: target.userId,
            shockerId,
            error: `Shocker ${shockerId} does not support shock.`,
          });
          shockerValidationFailed = true;
          break;
        }
        if (operation === 1 && !shocker.CanVibrate) {
          prepFailures.push({
            targetUserId: target.userId,
            shockerId,
            error: `Shocker ${shockerId} does not support vibrate.`,
          });
          shockerValidationFailed = true;
          break;
        }
        if (operation === 2 && !shocker.CanBeep) {
          prepFailures.push({
            targetUserId: target.userId,
            shockerId,
            error: `Shocker ${shockerId} does not support beep.`,
          });
          shockerValidationFailed = true;
          break;
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
          prepFailures.push({
            targetUserId: target.userId,
            shockerId,
            error: `Exceeds limits for this shocker (max ${effectiveMaxIntensity}% / ${effectiveMaxDuration}s).`,
          });
          shockerValidationFailed = true;
          break;
        }
      }
      if (shockerValidationFailed) continue;

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
          prepFailures.push({
            targetUserId: target.userId,
            shockerId: stillMissing,
            error:
              generatedShareCodesResult.error ||
              `Shocker ${stillMissing} has no generated sharecode.`,
          });
          continue;
        }
        generatedShareCodes = merged;
        creds.generatedShareCodes = generatedShareCodes;
        creds.generatedShareCodesLastUpdated = new Date().toISOString();
        targetUserData.credentials = btoa(JSON.stringify(creds));
        await env.PISHOCK_KV.put(`user:${target.userId}:data`, JSON.stringify(targetUserData));
      }

      const shareCodesByShockerId: Record<string, string> = {};
      let shareCodesComplete = true;
      for (const shockerId of normalizedShockers) {
        const shareCode = getGeneratedShareCodeForShocker(generatedShareCodes, shockerId);
        if (!shareCode) {
          prepFailures.push({
            targetUserId: target.userId,
            shockerId,
            error: `Shocker ${shockerId} has no generated sharecode.`,
          });
          shareCodesComplete = false;
          break;
        }
        shareCodesByShockerId[shockerId] = shareCode;
      }
      if (!shareCodesComplete) continue;

      prepared.push({
        targetUserId: target.userId,
        targetName: await getCachedDisplayName(env.PISHOCK_KV, target.userId),
        credentials: targetCredentials,
        shockerIds: normalizedShockers,
        shareCodesByShockerId,
      });
    }

    if (prepared.length === 0) {
      return jsonResponse(
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

    const executorName = await getCachedDisplayName(env.PISHOCK_KV, executorUserId);
    const successfulEntries = executionResults.filter((entry) =>
      entry.operations.every((op) => op.result.ok)
    );
    await Promise.all(
      successfulEntries.map(async ({ target }) => {
        await addToActivityBatch(env.PISHOCK_KV, {
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

    return jsonResponse(
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
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      500
    );
  }
};
