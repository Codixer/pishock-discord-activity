import { v4 as uuidv4 } from 'uuid';
import {
  generateLegacyShareCodesForOwnedShockers,
  getAllowedShockersForController,
  getGeneratedShareCodeForShocker,
  normalizeGeneratedShareCodes,
  operatePiShockShocker,
  operatePiShockShareCode,
} from '../../_shared/pishock-client';
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

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

async function requireAuth(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

// Token refresh helper function
async function refreshDiscordToken(userId: string, kv: KVNamespace, env: Env): Promise<string | null> {
  try {
    if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
      return null;
    }

    const metadataStr = await kv.get(`discord_token_metadata:${userId}`);
    if (!metadataStr) return null;

    const metadata = JSON.parse(metadataStr);
    if (!metadata.refresh_token) return null;

    console.log(`Refreshing token for user ${userId}`);

    const params = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: metadata.refresh_token
    });

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      console.error(`Token refresh failed for user ${userId}`);
      return null;
    }

    const newTokenData = await response.json();
    const { access_token, refresh_token, expires_in } = newTokenData;
    const expiresAt = Math.floor(Date.now() / 1000) + expires_in;

    await Promise.all([
      kv.put(`discord_token_metadata:${userId}`, JSON.stringify({
        access_token,
        refresh_token: refresh_token || metadata.refresh_token,
        expires_at: expiresAt,
        expires_in,
        token_type: 'Bearer',
        user_id: userId,
        created_at: Math.floor(Date.now() / 1000)
      }), { expirationTtl: expires_in + 86400 }),
      kv.put(`discord_token:${userId}`, access_token, { expirationTtl: expires_in - 60 }),
      kv.put(`discord_token_validation:${access_token.slice(-8)}`, JSON.stringify({
        id: userId,
        token_expires_at: expiresAt
      }), {
        expirationTtl: expires_in - 60 // Match token expiry
      })
    ]);

    console.log(`Token refreshed successfully for user ${userId}`);
    return access_token;
  } catch (error) {
    console.error(`Error refreshing token for user ${userId}:`, error);
    return null;
  }
}

async function validateDiscordToken(token: string, kv: KVNamespace, env?: Env): Promise<any> {
  try {
    const cacheKey = `discord_token_validation:${token.slice(-8)}`;
    const cached = await kv.get(cacheKey);
    
    if (cached) {
      const cachedData = JSON.parse(cached);
      
      // Check if token is expiring soon (< 1 hour) and refresh if possible
      if (env && cachedData.token_expires_at) {
        const now = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = cachedData.token_expires_at - now;
        
        if (timeUntilExpiry < 3600 && timeUntilExpiry > 0) {
          console.log(`Token expiring soon for user ${cachedData.id}, refreshing in background`);
          refreshDiscordToken(cachedData.id, kv, env).catch((err) => {
            console.error('Background token refresh failed:', err);
          });
        }
      }
      
      return cachedData;
    }
    
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error('Invalid Discord token');
    }
    
    const userData = await response.json();
    
    // Try to get expiry info from metadata
    let expiresAt = 0;
    let cacheTtl = 10800; // Default 3 hours if no metadata
    const metadataStr = await kv.get(`discord_token_metadata:${userData.id}`);
    if (metadataStr) {
      const metadata = JSON.parse(metadataStr);
      expiresAt = metadata.expires_at;
      // Use remaining token lifetime for cache TTL
      const now = Math.floor(Date.now() / 1000);
      const remainingTime = expiresAt - now;
      cacheTtl = Math.max(60, remainingTime - 60); // At least 1 minute
    }
    
    await kv.put(cacheKey, JSON.stringify({
      ...userData,
      token_expires_at: expiresAt
    }), {
      expirationTtl: cacheTtl // Match token expiry
    });
    
    return userData;
  } catch (error) {
    return null;
  }
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

  const user = await validateDiscordToken(token, env.PISHOCK_KV, env);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    const { executorUserId, intensity, duration, operation } = await request.json();

    if (!executorUserId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters' 
      }, 400);
    }
    if (user.id !== executorUserId) {
      return jsonResponse({
        success: false,
        error: 'Executor mismatch for authenticated user.',
      }, 403);
    }

    try {
      const targetUserDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
      if (targetUserDataStr) {
        const targetUserData = JSON.parse(targetUserDataStr);
        const bannedExecutors = targetUserData.bannedExecutors || [];
        if (targetUserData.commandsPaused) {
          return jsonResponse({
            success: false,
            error: 'This user has paused all incoming commands.',
            paused: true,
            targetUserId
          }, 423);
        }
        
        if (bannedExecutors.includes(executorUserId)) {
          const executorUserData = await env.PISHOCK_KV.get(`discord_user:${executorUserId}`);
          const executorUser = executorUserData ? JSON.parse(executorUserData) : null;
          const executorName = executorUser?.global_name || executorUser?.username || 'Unknown User';
          
          const targetUserData2 = await env.PISHOCK_KV.get(`discord_user:${targetUserId}`);
          const targetUser = targetUserData2 ? JSON.parse(targetUserData2) : null;
          const targetName = targetUser?.global_name || targetUser?.username || 'Unknown User';
          
          return jsonResponse({ 
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

    const userDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
    let userData = userDataStr ? JSON.parse(userDataStr) : null;
    let encrypted = userData?.credentials;
    
    if (!encrypted) {
      const oldEncrypted = await env.PISHOCK_KV.get(`user:${targetUserId}:pishock`);
      if (oldEncrypted) {
        userData = {
          credentials: oldEncrypted,
          lastTested: await env.PISHOCK_KV.get(`user:${targetUserId}:pishock:lastTested`) || new Date().toISOString(),
          configuredBy: await env.PISHOCK_KV.get(`user:${targetUserId}:pishock:configuredBy`) || 'unknown',
          hasOwnDevice: (await env.PISHOCK_KV.get(`user:${targetUserId}:pishock:hasOwnDevice`)) === 'true',
          piShockUserId: await env.PISHOCK_KV.get(`user:${targetUserId}:pishock:piShockUserId`) || null,
          lastUpdated: new Date().toISOString()
        };
        
        await env.PISHOCK_KV.put(`user:${targetUserId}:data`, JSON.stringify(userData));
        
        await Promise.all([
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock`),
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock:lastTested`),
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock:configuredBy`),
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock:hasOwnDevice`),
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock:piShockUserId`)
        ]);
        
        encrypted = userData.credentials;
      }
    }
    
    if (!encrypted) {
      return jsonResponse({ 
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

      const allowedResult = await getAllowedShockersForController(pishockCredentials);
      if (!allowedResult.ok || !allowedResult.data) {
        throw new Error(allowedResult.error || 'Unable to verify allowed shockers for this account.');
      }
      const ownedShockerIds = allowedResult.data.allowedShockers
        .filter((shocker: any) => shocker?.ShockerId !== undefined && shocker?.ShockerId !== null)
        .map((shocker: any) => String(shocker.ShockerId));
      if (!ownedShockerIds.includes(String(selectedShockerId))) {
        throw new Error('Selected shocker is not an active owned device for this PiShock account.');
      }
      const selectedShocker = allowedResult.data.allowedShockers.find(
        (shocker: any) => String(shocker?.ShockerId) === String(selectedShockerId)
      );
      if (!selectedShocker) {
        throw new Error('Selected shocker context is unavailable.');
      }

      let generatedShareCodes = normalizeGeneratedShareCodes(creds.generatedShareCodes);
      let shareCodeGenerationFailed = false;
      if (!getGeneratedShareCodeForShocker(generatedShareCodes, String(selectedShockerId))) {
        const generatedShareCodesResult = await generateLegacyShareCodesForOwnedShockers(
          pishockCredentials,
          [String(selectedShockerId)]
        );
        const merged = {
          ...generatedShareCodes,
          ...(generatedShareCodesResult.data
            ? normalizeGeneratedShareCodes(generatedShareCodesResult.data)
            : {}),
        };
        if (!getGeneratedShareCodeForShocker(merged, String(selectedShockerId))) {
          shareCodeGenerationFailed = true;
        } else {
          generatedShareCodes = merged;
          creds.generatedShareCodes = generatedShareCodes;
          creds.generatedShareCodesLastUpdated = new Date().toISOString();
          userData.credentials = btoa(JSON.stringify(creds));
          await env.PISHOCK_KV.put(`user:${targetUserId}:data`, JSON.stringify(userData));
        }
      }
      const explicitSelectedShareCode = typeof creds.selectedShareCode === 'string'
        ? creds.selectedShareCode.trim()
        : '';
      const selectedShareCode = explicitSelectedShareCode || getGeneratedShareCodeForShocker(generatedShareCodes, String(selectedShockerId));
      const useDirectShockerOperation = !selectedShareCode;

      if (operation === 0 && !selectedShocker.CanShock) {
        return jsonResponse({
          success: false,
          error: 'Target PiShock does not allow shock commands.',
          capabilityBlocked: true,
          operation: 'shock',
        }, 400);
      }
      if (operation === 1 && !selectedShocker.CanVibrate) {
        return jsonResponse({
          success: false,
          error: 'Target PiShock does not allow vibrate commands.',
          capabilityBlocked: true,
          operation: 'vibrate',
        }, 400);
      }
      if (operation === 2 && !selectedShocker.CanBeep) {
        return jsonResponse({
          success: false,
          error: 'Target PiShock does not allow beep commands.',
          capabilityBlocked: true,
          operation: 'beep',
        }, 400);
      }

      const configuredMaxIntensity = Number(creds.maxIntensity) || 100;
      const configuredMaxDuration = Number(creds.maxDuration) || 15;
      let effectiveMaxIntensity = configuredMaxIntensity;
      let effectiveMaxDuration = configuredMaxDuration;
      const apiMaxIntensity = Number(selectedShocker.MaxIntensity);
      if (Number.isFinite(apiMaxIntensity) && apiMaxIntensity > 0) {
        effectiveMaxIntensity = Math.min(effectiveMaxIntensity, Math.floor(apiMaxIntensity));
      }
      const apiMaxDurationMs = Number(selectedShocker.MaxDuration);
      if (Number.isFinite(apiMaxDurationMs) && apiMaxDurationMs > 0) {
        effectiveMaxDuration = Math.min(
          effectiveMaxDuration,
          Math.max(1, Math.floor(apiMaxDurationMs / 1000))
        );
      }

      const overLimitAttempt = intensity > effectiveMaxIntensity || duration > effectiveMaxDuration;
      let pendingOverlimitEntitlementId: string | undefined;
      if (overLimitAttempt) {
        if (!creds.allowOverLimitWithConsumable) {
          return jsonResponse({
            success: false,
            error: `Command exceeds target limits (${effectiveMaxIntensity}% / ${effectiveMaxDuration}s) and over-limit consent is disabled.`,
          });
        }

        const entitlementState = await getControllerPlusState(env, executorUserId);
        if (!entitlementState.overlimitEntitlementId) {
          return jsonResponse({
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

      const executorInfo = await getUserInfo(env.PISHOCK_KV, executorUserId, token);
      const targetInfo = await getUserInfo(env.PISHOCK_KV, targetUserId, token);

      const logEntry: ActivityLogEntry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        instanceId: 'global',
        executorUserId,
        executorUsername: executorInfo?.username || 'Unknown User',
        executorAvatar: executorInfo?.avatar,
        targetUserId,
        targetUsername: targetInfo?.username || 'Unknown User',
        targetAvatar: targetInfo?.avatar,
        action: operationName as 'shock' | 'vibrate' | 'beep',
        intensity,
        duration,
      };

      try {
        await addToActivityBatch(env.PISHOCK_KV, logEntry);
      } catch (logError) {
        console.error('Failed to log activity (CRITICAL):', logError);
      }

      return jsonResponse({ 
        success: true, 
        logEntryId: logEntry.id,
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
      return jsonResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Command execution failed' 
      });
    }
  } catch (error) {
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};