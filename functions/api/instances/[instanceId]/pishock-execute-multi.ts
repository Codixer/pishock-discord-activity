import { v4 as uuidv4 } from 'uuid';

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
  multiTarget?: boolean;
  targetUserIds?: string[];
}

const CONTROLLER_PLUS_SKU_ID = "1387037988558606457";
const MAX_MULTI_TARGETS = 10;

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

async function validateDiscordToken(token: string, kv: KVNamespace, env?: Env): Promise<any> {
  try {
    const cacheKey = `discord_token_validation:${token.slice(-8)}`;
    const cached = await kv.get(cacheKey);
    
    if (cached) {
      const cachedData = JSON.parse(cached);
      
      if (env && cachedData.token_expires_at) {
        const now = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = cachedData.token_expires_at - now;
        
        if (timeUntilExpiry < 3600 && timeUntilExpiry > 0) {
          // Token expiring soon - refresh in background
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
    
    let expiresAt = 0;
    let cacheTtl = 10800;
    const metadataStr = await kv.get(`discord_token_metadata:${userData.id}`);
    if (metadataStr) {
      const metadata = JSON.parse(metadataStr);
      expiresAt = metadata.expires_at;
      const now = Math.floor(Date.now() / 1000);
      const remainingTime = expiresAt - now;
      cacheTtl = Math.max(60, remainingTime - 60);
    }
    
    await kv.put(cacheKey, JSON.stringify({
      ...userData,
      token_expires_at: expiresAt
    }), {
      expirationTtl: cacheTtl
    });
    
    return userData;
  } catch (error) {
    return null;
  }
}

async function refreshDiscordToken(userId: string, kv: KVNamespace, env: Env): Promise<string | null> {
  try {
    if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
      return null;
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
        expirationTtl: expires_in - 60
      })
    ]);

    return access_token;
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
        expirationTtl: 604800
      });
      
      return {
        username: user.global_name || user.username || 'Unknown User',
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png` : undefined
      };
    }
  } catch (error) {
    // Silently handle user info errors
  }
  
  return null;
}

async function fetchUserEntitlements(token: string): Promise<any> {
  try {
    const response = await fetch('https://discord.com/api/v9/applications/@me/entitlements', {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const entitlements = await response.json();
    return entitlements;
  } catch (error) {
    return null;
  }
}

async function verifyControllerPlus(token: string): Promise<boolean> {
  const entitlements = await fetchUserEntitlements(token);
  if (!entitlements || !Array.isArray(entitlements)) {
    return false;
  }
  
  for (const entitlement of entitlements) {
    if (entitlement.sku_id === CONTROLLER_PLUS_SKU_ID && entitlement.type === 5) {
      // Check if subscription is active
      if (entitlement.ends_at) {
        const expiresAt = new Date(entitlement.ends_at).getTime() / 1000;
        const now = Math.floor(Date.now() / 1000);
        return expiresAt > now;
      } else {
        // No expiration means active subscription
        return true;
      }
    }
  }
  
  return false;
}

async function executeCommand(targetUserId: string, creds: any, intensity: number, duration: number, operation: number): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      username: creds.username,
      apikey: creds.apiKey,
      code: creds.sharecode,
      intensity: intensity,
      duration: duration,
      op: operation,
      name: 'DiscordActivity',
    };
    
    const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PiShock-Discord-Activity/1.0'
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    if (!response.ok) {
      return { success: false, error: `PiShock API error: HTTP ${response.status} - ${responseText}` };
    }

    if (responseText.includes('Operation Succeeded')) {
      return { success: true };
    } else {
      if (responseText.includes("This code doesn't exist")) {
        return { success: false, error: 'Share code not found' };
      } else if (responseText.includes('Not Authorized')) {
        return { success: false, error: 'Not authorized' };
      } else if (responseText.includes('Shocker is Paused')) {
        return { success: false, error: 'Device is paused' };
      } else if (responseText.includes('Device currently not connected')) {
        return { success: false, error: 'Device not connected' };
      } else {
        return { success: false, error: 'Unknown error' };
      }
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Command execution failed' };
  }
}

async function addToActivityBatch(kv: KVNamespace, entry: ActivityLogEntry) {
  try {
    const date = new Date(entry.timestamp).toISOString().split('T')[0];
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
    
    if (batchData.entries.length > 500) {
      batchData.entries = batchData.entries.slice(0, 500);
    }
    
    await kv.put(batchKey, JSON.stringify(batchData), { expirationTtl: 2592000 });
  } catch (error) {
    console.error('Failed to update activity batch:', error);
    throw error;
  }
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
    const { targetUserIds, intensity, duration, operation } = await request.json();

    if (!targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
      return jsonResponse({ 
        success: false, 
        error: 'targetUserIds must be a non-empty array' 
      }, 400);
    }

    if (targetUserIds.length > MAX_MULTI_TARGETS) {
      return jsonResponse({ 
        success: false, 
        error: `Maximum ${MAX_MULTI_TARGETS} targets allowed` 
      }, 400);
    }

    if (intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters' 
      }, 400);
    }

    // Verify Controller+ subscription
    const hasControllerPlus = await verifyControllerPlus(token);
    if (!hasControllerPlus) {
      return jsonResponse({ 
        success: false, 
        error: 'Controller+ subscription required for multi-target commands. Please purchase Controller+ in settings to use this feature.',
        requiresControllerPlus: true
      }, 403);
    }

    const executorInfo = await getUserInfo(env.PISHOCK_KV, user.id, token);
    const operationNames = ['shock', 'vibrate', 'beep'];
    const operationName = operationNames[operation];

    // Execute commands for all targets in parallel
    const executionResults = await Promise.allSettled(
      targetUserIds.map(async (targetUserId: string) => {
        // Get target user credentials
        const userDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
        let userData = userDataStr ? JSON.parse(userDataStr) : null;
        let encrypted = userData?.credentials;
        
        if (!encrypted) {
          return { targetUserId, success: false, error: 'No PiShock device configured' };
        }

        try {
          const creds = await decrypt(encrypted);
          
          // Respect individual user limits
          const targetMaxIntensity = creds.maxIntensity || 100;
          const targetMaxDuration = creds.maxDuration || 15;
          
          const effectiveIntensity = Math.min(intensity, targetMaxIntensity);
          const effectiveDuration = Math.min(duration, targetMaxDuration);
          
          const result = await executeCommand(targetUserId, creds, effectiveIntensity, effectiveDuration, operation);
          
          // Get target user info for logging
          const targetInfo = await getUserInfo(env.PISHOCK_KV, targetUserId, token);
          
          // Log each successful command
          if (result.success) {
            const logEntry: ActivityLogEntry = {
              id: uuidv4(),
              timestamp: new Date().toISOString(),
              instanceId,
              executorUserId: user.id,
              executorUsername: executorInfo?.username || 'Unknown User',
              executorAvatar: executorInfo?.avatar,
              targetUserId,
              targetUsername: targetInfo?.username || 'Unknown User',
              targetAvatar: targetInfo?.avatar,
              action: operationName as 'shock' | 'vibrate' | 'beep',
              intensity: effectiveIntensity,
              duration: effectiveDuration,
              multiTarget: true,
              targetUserIds: targetUserIds,
            };

            try {
              await addToActivityBatch(env.PISHOCK_KV, logEntry);
            } catch (logError) {
              console.error('Failed to log activity:', logError);
            }
          }
          
          return { targetUserId, success: result.success, error: result.error };
        } catch (error) {
          return { 
            targetUserId, 
            success: false, 
            error: error instanceof Error ? error.message : 'Command execution failed' 
          };
        }
      })
    );

    const results = executionResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return { 
          targetUserId: targetUserIds[index], 
          success: false, 
          error: result.reason?.message || 'Unknown error' 
        };
      }
    });

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return jsonResponse({ 
      success: successCount > 0,
      results,
      summary: {
        total: targetUserIds.length,
        successful: successCount,
        failed: failureCount
      }
    });

  } catch (error) {
    return jsonResponse({ 
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};

