import { v4 as uuidv4 } from 'uuid';
import {
  getGeneratedShareCodeForShocker,
  operatePiShockShocker,
  operatePiShockShareCode,
} from '../../_shared/pishock-client';
import { validateDiscordTokenWithRefresh } from '../../_shared/token-utils';
import { consumeOverlimitEntitlement, getControllerPlusState } from '../../_shared/discord-entitlements';
import { ACTIVITY_BATCH_KV_TTL_SECONDS } from '../../_shared/activity-batch-kv';

interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_BOT_TOKEN?: string;
}

interface PagesFunction<Env = unknown> {
  (context: { request: Request; env: Env; params: Record<string, string>; waitUntil: (promise: Promise<any>) => void; passThroughOnException: () => void; }): Promise<Response> | Response;
}

interface ActivityLogEntry {
  id: string;
  timestamp: string;
  instanceId: string;
  executorUserId: string;
  executorUsername: string;
  executorAvatar?: string;
  targetUserId: string;
  targetUsername: string;
  targetAvatar?: string;
  action: 'shock' | 'vibrate' | 'beep';
  intensity: number;
  duration: number;
  guildId?: string;
  guildName?: string;
}

function jsonResponse(body: any, status = 200, additionalHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...additionalHeaders,
    },
  });
}

function createPerformanceHeaders(
  startedAtMs: number,
  kvReads: number,
  kvWrites: number,
  executeStageDurationMs: number
): Record<string, string> {
  const totalMs = Math.max(0, Date.now() - startedAtMs);
  return {
    'X-Response-Time-Ms': String(totalMs),
    'X-KV-Reads-Estimate': String(kvReads),
    'X-KV-Writes-Estimate': String(kvWrites),
    'Server-Timing': `app;dur=${totalMs},execute;dur=${Math.max(0, executeStageDurationMs)}`,
  };
}

async function requireAuth(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

async function validateDiscordToken(token: string, kv: KVNamespace, env?: Env): Promise<any> {
  if (!env) return null;
  return validateDiscordTokenWithRefresh(token, kv, {
    PISHOCK_KV: kv,
    DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID || '',
    DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET || '',
  });
}

async function decrypt(encryptedData: string): Promise<any> {
  try {
    const dataString = atob(encryptedData);
    return JSON.parse(dataString);
  } catch (error) {
    throw new Error('Failed to decrypt data');
  }
}

async function getUserInfo(kv: KVNamespace, userId: string, token: string): Promise<{ username: string; avatar?: string } | null> {
  try {
    const cachedData = await kv.get(`discord_user:${userId}`);
    if (cachedData) {
      const user = JSON.parse(cachedData);
      return {
        username: user.global_name || user.username || 'Unknown User',
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png` : undefined
      };
    }
    
    const response = await fetch(`https://discord.com/api/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (response.ok) {
      const user = await response.json();
      
      await kv.put(`discord_user:${userId}`, JSON.stringify(user), {
        expirationTtl: 604800 // 7 days - reduced KV writes
      });
      
      return {
        username: user.global_name || user.username || 'Unknown User',
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png` : undefined
      };
    } else {
      // Silently handle failed user fetch
    }
  } catch (error) {
    // Silently handle user info errors
  }
  
  return null;
}

async function addToActivityBatch(kv: KVNamespace, entry: ActivityLogEntry) {
  try {
    const date = new Date(entry.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
    const batchKey = `activity:batch:${date}`;
    
    let batch = await kv.get(batchKey);
    let batchData = batch ? JSON.parse(batch) : {
      entries: [],
      lastUpdated: entry.timestamp,
      totalCount: 0
    };
    
    batchData.entries.unshift(entry);
    batchData.lastUpdated = entry.timestamp;
    batchData.totalCount++;
    
    // Increased from 200 to 500 to reduce write frequency
    if (batchData.entries.length > 500) {
      batchData.entries = batchData.entries.slice(0, 500);
    }
    
    await kv.put(batchKey, JSON.stringify(batchData), { expirationTtl: ACTIVITY_BATCH_KV_TTL_SECONDS });
  } catch (error) {
    console.error('Failed to update activity batch:', error);
    throw error;
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const method = request.method;
  const targetUserId = params.userId as string;
  const startedAtMs = Date.now();
  let executeStageStartedAtMs = 0;
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
        executeStageStartedAtMs > 0 ? Date.now() - executeStageStartedAtMs : 0
      ),
    });

  // Handle CORS preflight requests
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token, trackedKv, env);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    executeStageStartedAtMs = Date.now();
    const { executorUserId, intensity, duration, operation } = await request.json();

    if (!executorUserId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return respond({ 
        success: false, 
        error: 'Invalid parameters' 
      }, 400);
    }
    if (user.id !== executorUserId) {
      return respond({
        success: false,
        error: 'Executor mismatch for authenticated user.',
      }, 403);
    }

    try {
      const targetUserDataStr = await trackedKv.get(`user:${targetUserId}:data`);
      if (targetUserDataStr) {
        const targetUserData = JSON.parse(targetUserDataStr);
        const bannedExecutors = targetUserData.bannedExecutors || [];
        if (targetUserData.commandsPaused) {
          return respond({
            success: false,
            error: 'This user has paused all incoming commands.',
            paused: true,
            targetUserId
          }, 423);
        }
        
        if (bannedExecutors.includes(executorUserId)) {
          const executorUserData = await trackedKv.get(`discord_user:${executorUserId}`);
          const executorUser = executorUserData ? JSON.parse(executorUserData) : null;
          const executorName = executorUser?.global_name || executorUser?.username || 'Unknown User';
          
          const targetUserData2 = await trackedKv.get(`discord_user:${targetUserId}`);
          const targetUser = targetUserData2 ? JSON.parse(targetUserData2) : null;
          const targetName = targetUser?.global_name || targetUser?.username || 'Unknown User';
          
          return respond({ 
            success: false, 
            error: `${targetName} has blocked ${executorName} from sending commands to their device.`,
            banned: true,
            executorUserId,
            targetUserId
          }, 403);
        }
      }
    } catch (banCheckError) {
      // Continue with command execution if ban check fails
    }

    const userDataStr = await trackedKv.get(`user:${targetUserId}:data`);
    let userData = userDataStr ? JSON.parse(userDataStr) : null;
    let encrypted = userData?.credentials;
    
    if (!encrypted) {
      const oldEncrypted = await trackedKv.get(`user:${targetUserId}:pishock`);
      if (oldEncrypted) {
        userData = {
          credentials: oldEncrypted,
          lastTested: await trackedKv.get(`user:${targetUserId}:pishock:lastTested`) || new Date().toISOString(),
          configuredBy: await trackedKv.get(`user:${targetUserId}:pishock:configuredBy`) || 'unknown',
          hasOwnDevice: (await trackedKv.get(`user:${targetUserId}:pishock:hasOwnDevice`)) === 'true',
          piShockUserId: await trackedKv.get(`user:${targetUserId}:pishock:piShockUserId`) || null,
          lastUpdated: new Date().toISOString()
        };
        
        await trackedKv.put(`user:${targetUserId}:data`, JSON.stringify(userData));
        
        await Promise.all([
          trackedKv.delete(`user:${targetUserId}:pishock`),
          trackedKv.delete(`user:${targetUserId}:pishock:lastTested`),
          trackedKv.delete(`user:${targetUserId}:pishock:configuredBy`),
          trackedKv.delete(`user:${targetUserId}:pishock:hasOwnDevice`),
          trackedKv.delete(`user:${targetUserId}:pishock:piShockUserId`)
        ]);
        
        encrypted = userData.credentials;
      }
    }
    
    if (!encrypted) {
      return respond({ 
        success: false, 
        error: `Target user (${targetUserId}) has no PiShock device configured. They need to set up their PiShock credentials first in the application.`,
      });
    }

    try {
      const creds = await decrypt(encrypted);
      
      const operationNames = ['shock', 'vibrate', 'beep'];
      const operationName = operationNames[operation];
      
      const pishockCredentials = {
        apiKey: creds.apiKey,
        username: creds.username,
        piShockUserId: creds.piShockUserId,
      };
      const selectedShockerId = creds.selectedShockerId || creds.shockerId;
      if (!selectedShockerId) {
        throw new Error('No selected shocker configured for this user.');
      }

      const selectedShockerCaps = Array.isArray(creds.shockerCapabilities)
        ? creds.shockerCapabilities.find((cap: any) => String(cap?.id) === String(selectedShockerId))
        : null;

      if (operation === 0 && selectedShockerCaps && selectedShockerCaps.canShock === false) {
        return respond({
          success: false,
          error: 'Target PiShock does not allow shock commands.',
          capabilityBlocked: true,
          operation: 'shock',
        }, 400);
      }
      if (operation === 1 && selectedShockerCaps && selectedShockerCaps.canVibrate === false) {
        return respond({
          success: false,
          error: 'Target PiShock does not allow vibrate commands.',
          capabilityBlocked: true,
          operation: 'vibrate',
        }, 400);
      }
      if (operation === 2 && selectedShockerCaps && selectedShockerCaps.canBeep === false) {
        return respond({
          success: false,
          error: 'Target PiShock does not allow beep commands.',
          capabilityBlocked: true,
          operation: 'beep',
        }, 400);
      }

      const explicitSelectedShareCode = typeof creds.selectedShareCode === 'string'
        ? creds.selectedShareCode.trim()
        : '';
      const selectedShareCode = explicitSelectedShareCode ||
        getGeneratedShareCodeForShocker(creds.generatedShareCodes, String(selectedShockerId));
      const useDirectShockerOperation = !selectedShareCode;
      const shareCodeGenerationFailed = false;

      const configuredMaxIntensity = Number(creds.maxIntensity) || 100;
      const configuredMaxDuration = Number(creds.maxDuration) || 15;
      const effectiveMaxIntensity = configuredMaxIntensity;
      const effectiveMaxDuration = configuredMaxDuration;

      const overLimitAttempt = intensity > effectiveMaxIntensity || duration > effectiveMaxDuration;
      let pendingOverlimitEntitlementId: string | undefined;
      if (overLimitAttempt) {
        if (!creds.allowOverLimitWithConsumable) {
          return respond({
            success: false,
            error: `Command exceeds target limits (${effectiveMaxIntensity}% / ${effectiveMaxDuration}s) and over-limit consent is disabled.`,
          });
        }

        const entitlementState = await getControllerPlusState(env, executorUserId);
        if (!entitlementState.overlimitEntitlementId) {
          return respond({
            success: false,
            error: 'Over-limit command requires an available consumable entitlement.',
          }, 403);
        }

        pendingOverlimitEntitlementId = entitlementState.overlimitEntitlementId;
      }

      const operateResult = useDirectShockerOperation
        ? await operatePiShockShocker(pishockCredentials, String(selectedShockerId), {
            operation,
            intensity,
            durationSeconds: duration,
            agentName: 'DiscordActivity',
          })
        : await operatePiShockShareCode(pishockCredentials, selectedShareCode, {
            operation,
            intensity,
            durationSeconds: duration,
            agentName: 'DiscordActivity',
          });

      if (!operateResult.ok) {
        throw new Error(operateResult.error || 'PiShock operation failed.');
      }

      let consumedEntitlementId: string | undefined;
      if (overLimitAttempt && pendingOverlimitEntitlementId) {
        await consumeOverlimitEntitlement(env, pendingOverlimitEntitlementId);
        consumedEntitlementId = pendingOverlimitEntitlementId;
      }

      const logEntryId = uuidv4();
      const logEntry: ActivityLogEntry = {
        id: logEntryId,
        timestamp: new Date().toISOString(),
        instanceId: 'global',
        executorUserId,
        executorUsername: 'Unknown User',
        targetUserId,
        targetUsername: 'Unknown User',
        action: operationName as 'shock' | 'vibrate' | 'beep',
        intensity,
        duration,
      };

      context.waitUntil((async () => {
        try {
          const executorInfo = await getUserInfo(trackedKv, executorUserId, token);
          const targetInfo = await getUserInfo(trackedKv, targetUserId, token);
          await addToActivityBatch(trackedKv, {
            ...logEntry,
            executorUsername: executorInfo?.username || logEntry.executorUsername,
            executorAvatar: executorInfo?.avatar,
            targetUsername: targetInfo?.username || logEntry.targetUsername,
            targetAvatar: targetInfo?.avatar,
          });
        } catch (logError) {
          console.error('Failed to log activity (background):', logError);
        }
      })());

      return respond({ 
        success: true, 
        logEntryId,
        message: `${operationName} command executed successfully`,
        selectedShockerId: String(selectedShockerId),
        overLimitUsed: overLimitAttempt,
        consumedOverlimitEntitlementId: consumedEntitlementId || null,
        effectiveMaxIntensity,
        effectiveMaxDuration,
        usingLegacySharecodeFallback: Boolean(creds.sharecode && !creds.selectedShockerId),
        deprecations: [],
        hasGeneratedShareCodeForSelected: Boolean(selectedShareCode),
        usedDirectShockerFallback: useDirectShockerOperation,
        shareCodeGenerationFailed,
      });

    } catch (error) {
      return respond({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Command execution failed' 
      });
    }
  } catch (error) {
    return respond({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};