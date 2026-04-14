import { v4 as uuidv4 } from 'uuid';
import { operatePiShockShocker } from '../../_shared/pishock-client';
import { getControllerPlusState } from '../../_shared/discord-entitlements';

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
  await kv.put(batchKey, JSON.stringify(batchData), { expirationTtl: 2592000 });
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

    const prepared: Array<{
      targetUserId: string;
      targetName: string;
      credentials: { apiKey: string; username: string; piShockUserId?: string };
      shockerIds: string[];
    }> = [];

    for (const target of targets) {
      const targetUserDataStr = await env.PISHOCK_KV.get(`user:${target.userId}:data`);
      if (!targetUserDataStr) {
        return jsonResponse({ success: false, error: `Target ${target.userId} has no configured PiShock settings.` }, 400);
      }
      const targetUserData = JSON.parse(targetUserDataStr);
      if ((targetUserData.bannedExecutors || []).includes(executorUserId)) {
        return jsonResponse({ success: false, error: `Target ${target.userId} has blocked this executor.` }, 403);
      }
      const creds = await decrypt(targetUserData.credentials);

      const maxIntensity = creds.maxIntensity || 100;
      const maxDuration = creds.maxDuration || 15;
      if (intensity > maxIntensity || duration > maxDuration) {
        return jsonResponse({
          success: false,
          error: `Multishock cannot bypass limits (target ${target.userId} allows max ${maxIntensity}%/${maxDuration}s).`,
        }, 400);
      }

      const selectedShockerId = creds.selectedShockerId || creds.shockerId;
      const allowed = Array.isArray(creds.allowedShockerIds) ? creds.allowedShockerIds.map((id: any) => String(id)) : [];
      const effectiveAllowed = allowed.length > 0 ? allowed : (selectedShockerId ? [String(selectedShockerId)] : []);
      const requestedShockers = Array.isArray(target.shockerIds) && target.shockerIds.length > 0
        ? target.shockerIds.map((id) => String(id))
        : effectiveAllowed;
      const normalizedShockers = requestedShockers.filter((id) => effectiveAllowed.includes(id));

      if (normalizedShockers.length === 0) {
        return jsonResponse({ success: false, error: `Target ${target.userId} has no allowed shockers for multishock.` }, 400);
      }

      prepared.push({
        targetUserId: target.userId,
        targetName: await getCachedDisplayName(env.PISHOCK_KV, target.userId),
        credentials: {
          apiKey: creds.apiKey,
          username: creds.username,
          piShockUserId: creds.piShockUserId,
        },
        shockerIds: normalizedShockers,
      });
    }

    const operationName = ['shock', 'vibrate', 'beep'][operation] as 'shock' | 'vibrate' | 'beep';
    const executionResults = await Promise.all(prepared.map(async (target) => {
      const operations = await Promise.all(target.shockerIds.map(async (shockerId) => {
        const result = await operatePiShockShocker(target.credentials, shockerId, {
          operation,
          intensity,
          durationSeconds: duration,
          agentName: 'DiscordActivityMultishock',
        });
        return { shockerId, result };
      }));
      return { target, operations };
    }));

    const failures = executionResults.flatMap((entry) =>
      entry.operations
        .filter((operationResult) => !operationResult.result.ok)
        .map((operationResult) => ({
          targetUserId: entry.target.targetUserId,
          shockerId: operationResult.shockerId,
          error: operationResult.result.error || 'Unknown execution error',
        }))
    );

    const executorName = await getCachedDisplayName(env.PISHOCK_KV, executorUserId);
    await Promise.all(executionResults.map(async ({ target }) => {
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
    }));

    return jsonResponse({
      success: failures.length === 0,
      partialSuccess: failures.length > 0,
      targetCount: prepared.length,
      operationCount: executionResults.reduce((total, item) => total + item.operations.length, 0),
      failures,
      overLimitAllowed: false,
    }, failures.length > 0 ? 207 : 200);
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, 500);
  }
};
