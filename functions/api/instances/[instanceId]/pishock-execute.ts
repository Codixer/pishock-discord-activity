import { v4 as uuidv4 } from 'uuid';
import {
  generateLegacyShareCodesForOwnedShockers,
  getAllowedShockersForController,
  getGeneratedShareCodeForShocker,
  normalizeGeneratedShareCodes,
  operatePiShockShareCode,
} from '../../_shared/pishock-client';
import { ACTIVITY_BATCH_KV_TTL_SECONDS } from '../../_shared/activity-batch-kv';

interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
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
      return null; // Can't refresh without credentials
    }

    const metadataStr = await kv.get(`discord_token_metadata:${userId}`);
    if (!metadataStr) return null;

    const metadata = JSON.parse(metadataStr);
    if (!metadata.refresh_token) return null;

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

    if (!response.ok) return null;

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

    return access_token;
  } catch (error) {
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
          // Token expiring soon - refresh in background (don't block request)
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
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const method = request.method;
  const instanceId = params.instanceId as string;

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
    const { targetUserId, intensity, duration, operation } = await request.json();

    if (!targetUserId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters' 
      }, 400);
    }

    const encrypted = await env.PISHOCK_KV.get(`instance:${instanceId}:pishock`);
    if (!encrypted) {
      return jsonResponse({ 
        success: false, 
        error: 'No PiShock credentials configured for this instance' 
      });
    }

    try {
      const creds = await decrypt(encrypted);
      
      const pishockCredentials = {
        apiKey: creds.apiKey,
        username: creds.username,
        piShockUserId: creds.piShockUserId,
      };
      const selectedShockerId = creds.selectedShockerId || creds.shockerId;
      if (!selectedShockerId) {
        throw new Error('No selected shocker configured for this instance.');
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

      let generatedShareCodes = normalizeGeneratedShareCodes(creds.generatedShareCodes);
      if (!getGeneratedShareCodeForShocker(generatedShareCodes, String(selectedShockerId))) {
        const generatedShareCodesResult = await generateLegacyShareCodesForOwnedShockers(pishockCredentials, [
          String(selectedShockerId),
        ]);
        const merged = {
          ...generatedShareCodes,
          ...(generatedShareCodesResult.data
            ? normalizeGeneratedShareCodes(generatedShareCodesResult.data)
            : {}),
        };
        if (!getGeneratedShareCodeForShocker(merged, String(selectedShockerId))) {
          throw new Error(
            generatedShareCodesResult.error || 'Failed to generate sharecode for the selected shocker.'
          );
        }
        generatedShareCodes = merged;
        creds.generatedShareCodes = generatedShareCodes;
        creds.generatedShareCodesLastUpdated = new Date().toISOString();
        await env.PISHOCK_KV.put(`instance:${instanceId}:pishock`, btoa(JSON.stringify(creds)), { expirationTtl: 21600 });
      }
      const explicitSelectedShareCode = typeof creds.selectedShareCode === 'string'
        ? creds.selectedShareCode.trim()
        : '';
      const selectedShareCode = explicitSelectedShareCode || getGeneratedShareCodeForShocker(generatedShareCodes, String(selectedShockerId));
      if (!selectedShareCode) {
        throw new Error('Selected shocker does not have a generated sharecode.');
      }

      const operateResult = await operatePiShockShareCode(pishockCredentials, selectedShareCode, {
        operation,
        intensity,
        durationSeconds: duration,
        agentName: 'DiscordActivity',
      });

      if (!operateResult.ok) {
        throw new Error(operateResult.error || 'PiShock operation failed.');
      }

      const executorInfo = await getUserInfo(env.PISHOCK_KV, user.id, token);
      const targetInfo = await getUserInfo(env.PISHOCK_KV, targetUserId, token);

      const logEntry: ActivityLogEntry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        instanceId,
        executorUserId: user.id, 
        executorUsername: executorInfo?.username || user.global_name || user.username || 'Unknown User',
        executorAvatar: executorInfo?.avatar || (user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : undefined),
        targetUserId,
        targetUsername: targetInfo?.username || 'Unknown User',
        targetAvatar: targetInfo?.avatar,
        action: ['shock', 'vibrate', 'beep'][operation] as 'shock' | 'vibrate' | 'beep',
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
        selectedShockerId: String(selectedShockerId),
        hasGeneratedShareCodeForSelected: true,
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