import { v4 as uuidv4 } from 'uuid';

interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_APPLICATION_ID: string;
  SHOCK_BYPASS_SKU_ID: string;
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
  bypassUsed?: boolean;
}

interface BatchedActivityLog {
  entries: ActivityLogEntry[];
  lastUpdated: string;
  totalCount: number;
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

async function validateDiscordToken(token: string, kv: KVNamespace): Promise<any> {
  try {
    const cacheKey = `discord_token_validation:${token.slice(-8)}`;
    const cached = await kv.get(cacheKey);
    if (cached) {
      const cachedData = JSON.parse(cached);
      return cachedData;
    }
    
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error('Invalid Discord token');
    }
    
    const userData = await response.json();
    
    await kv.put(cacheKey, JSON.stringify(userData), {
      expirationTtl: 300 // 5 minutes
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
    const date = new Date(entry.timestamp).toISOString().split('T')[0];
    const batchKey = `activity:batch:${date}`;
    
    let batch = await kv.get(batchKey);
    let batchData: BatchedActivityLog = batch ? JSON.parse(batch) : {
      entries: [],
      lastUpdated: entry.timestamp,
      totalCount: 0
    };
    
    batchData.entries.unshift(entry);
    batchData.lastUpdated = entry.timestamp;
    batchData.totalCount++;
    
    if (batchData.entries.length > 150) {
      batchData.entries = batchData.entries.slice(0, 150);
    }
    
    await kv.put(batchKey, JSON.stringify(batchData), { expirationTtl: 604800 });
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
        expirationTtl: 86400
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

async function checkBypassEligibility(
  executorUserId: string, 
  targetUserId: string, 
  intensity: number, 
  duration: number,
  kv: KVNamespace,
  env: Env
): Promise<{ needsBypass: boolean; hasConsumables: boolean; canExecute: boolean; bypassUsed?: boolean }> {
  try {
    // Get target user's settings
    const targetUserDataStr = await kv.get(`user:${targetUserId}:data`);
    if (!targetUserDataStr) {
      return { needsBypass: false, hasConsumables: false, canExecute: false };
    }
    
    const targetUserData = JSON.parse(targetUserDataStr);
    const targetCreds = targetUserData.credentials ? await decrypt(targetUserData.credentials) : null;
    
    if (!targetCreds) {
      return { needsBypass: false, hasConsumables: false, canExecute: false };
    }
    
    const targetMaxIntensity = targetCreds.maxIntensity || 100;
    const targetMaxDuration = targetCreds.maxDuration || 15;
    const targetEnableShockBypass = targetCreds.enableShockBypass || false;
    
    const needsBypass = intensity > targetMaxIntensity || duration > targetMaxDuration;
    
    if (!needsBypass) {
      return { needsBypass: false, hasConsumables: false, canExecute: true };
    }
    
    if (!targetEnableShockBypass) {
      return { needsBypass: true, hasConsumables: false, canExecute: false };
    }
    
    // Check executor's consumable inventory
    const executorUserDataStr = await kv.get(`user:${executorUserId}:data`);
    if (!executorUserDataStr) {
      return { needsBypass: true, hasConsumables: false, canExecute: false };
    }
    
    const executorUserData = JSON.parse(executorUserDataStr);
    const consumableInventory = executorUserData.consumableInventory || {};
    const shockBypassCount = consumableInventory[env.SHOCK_BYPASS_SKU_ID] || 0;
    
    if (shockBypassCount > 0) {
      // Deduct one consumable
      consumableInventory[env.SHOCK_BYPASS_SKU_ID] = shockBypassCount - 1;
      executorUserData.consumableInventory = consumableInventory;
      
      await kv.put(`user:${executorUserId}:data`, JSON.stringify(executorUserData));
      
      return { needsBypass: true, hasConsumables: true, canExecute: true, bypassUsed: true };
    }
    
    return { needsBypass: true, hasConsumables: false, canExecute: false };
    
  } catch (error) {
    console.error('Bypass eligibility check failed:', error);
    return { needsBypass: false, hasConsumables: false, canExecute: false };
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

  const executorUser = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!executorUser) return new Response('Invalid token', { status: 401 });

  try {
    const { intensity, duration, operation } = await request.json();

    if (!targetUserId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters' 
      }, 400);
    }

    // Check if executor is banned by target user
    const targetUserDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
    if (!targetUserDataStr) {
      return jsonResponse({ 
        success: false, 
        error: 'Target user has no PiShock configuration' 
      });
    }

    const targetUserData = JSON.parse(targetUserDataStr);
    const bannedExecutors = targetUserData.bannedExecutors || [];
    
    if (bannedExecutors.includes(executorUser.id)) {
      return jsonResponse({ 
        success: false, 
        error: 'You are blocked by this user' 
      }, 403);
    }

    // Get target user's encrypted credentials
    if (!targetUserData.credentials) {
      return jsonResponse({ 
        success: false, 
        error: 'Target user has no PiShock credentials configured' 
      });
    }

    // Check bypass eligibility and consume consumables if needed
    const bypassCheck = await checkBypassEligibility(
      executorUser.id, 
      targetUserId, 
      intensity, 
      duration, 
      env.PISHOCK_KV,
      env
    );

    if (!bypassCheck.canExecute) {
      if (bypassCheck.needsBypass && !bypassCheck.hasConsumables) {
        return jsonResponse({ 
          success: false, 
          error: 'Command exceeds target user limits. Purchase "Shock Past User Limit" consumable from Discord store to bypass.' 
        });
      } else if (bypassCheck.needsBypass) {
        return jsonResponse({ 
          success: false, 
          error: 'Target user has not enabled bypass system for their device limits.' 
        });
      } else {
        return jsonResponse({ 
          success: false, 
          error: 'Cannot execute command on target user' 
        });
      }
    }

    try {
      const targetCreds = await decrypt(targetUserData.credentials);
      
      const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: targetCreds.username,
          apikey: targetCreds.apiKey,
          code: targetCreds.sharecode,
          intensity: intensity,
          duration: duration,
          op: operation,
          name: 'DiscordActivity',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PiShock API error: ${errorText}`);
      }

      const responseText = await response.text();
      if (!responseText.includes('Operation Succeeded') && !responseText.includes('Operation Attempted')) {
        throw new Error(`PiShock operation failed: ${responseText}`);
      }

      // Get user info for logging
      const executorInfo = await getUserInfo(env.PISHOCK_KV, executorUser.id, token);
      const targetInfo = await getUserInfo(env.PISHOCK_KV, targetUserId, token);

      const logEntry: ActivityLogEntry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        instanceId: 'user-command', // For direct user commands
        executorUserId: executorUser.id, 
        executorUsername: executorInfo?.username || executorUser.global_name || executorUser.username || 'Unknown User',
        executorAvatar: executorInfo?.avatar || (executorUser.avatar ? `https://cdn.discordapp.com/avatars/${executorUser.id}/${executorUser.avatar}.png` : undefined),
        targetUserId,
        targetUsername: targetInfo?.username || 'Unknown User',
        targetAvatar: targetInfo?.avatar,
        action: ['shock', 'vibrate', 'beep'][operation] as 'shock' | 'vibrate' | 'beep',
        intensity,
        duration,
        bypassUsed: bypassCheck.bypassUsed
      };

      try {
        await addToActivityBatch(env.PISHOCK_KV, logEntry);
      } catch (logError) {
        console.error('Failed to log activity (CRITICAL):', logError);
      }

      return jsonResponse({ 
        success: true, 
        logEntryId: logEntry.id,
        bypassUsed: bypassCheck.bypassUsed
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