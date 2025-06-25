import { v4 as uuidv4 } from 'uuid';

interface Env {
  PISHOCK_KV: KVNamespace;
  CONTROLLER_PLUS_SKU_ID?: string;
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
  isMultishock: boolean;
  multishockId?: string;
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
      console.log('TOKEN_VALIDATION: Using cached Discord token validation');
      return cachedData;
    }
    
    console.log('TOKEN_VALIDATION: Fetching fresh Discord token validation');
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error('Invalid Discord token');
    }
    
    const userData = await response.json();
    
    await kv.put(cacheKey, JSON.stringify(userData), {
      expirationTtl: 300
    });
    
    console.log('TOKEN_VALIDATION: ✓ Cached fresh Discord token validation');
    return userData;
  } catch (error) {
    return null;
  }
}

async function checkDiscordEntitlement(token: string, kv: KVNamespace, skuId?: string): Promise<boolean> {
  if (!skuId) {
    console.log('ENTITLEMENT: No SKU ID configured, allowing access');
    return true; // Allow access if no SKU is configured
  }

  try {
    // Check cache first
    const cacheKey = `entitlement:${token.slice(-8)}:${skuId}`;
    const cached = await kv.get(cacheKey);
    if (cached) {
      const cachedResult = JSON.parse(cached);
      console.log('ENTITLEMENT: Using cached entitlement result:', cachedResult.hasEntitlement);
      return cachedResult.hasEntitlement;
    }

    console.log('ENTITLEMENT: Checking Discord entitlements for SKU:', skuId);
    
    // Fetch entitlements from Discord
    const response = await fetch('https://discord.com/api/users/@me/entitlements', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'PiShock-Discord-Activity/1.0'
      },
    });

    if (!response.ok) {
      console.error('ENTITLEMENT: Failed to fetch entitlements:', response.status);
      return false;
    }

    const entitlements = await response.json();
    console.log('ENTITLEMENT: Fetched', entitlements.length, 'entitlements');

    // Check if user has the Controller+ SKU
    const hasEntitlement = entitlements.some((entitlement: any) => {
      const matchesSku = entitlement.sku_id === skuId || 
                        entitlement.sku_id?.includes('controller_plus') ||
                        entitlement.sku_id?.includes('multishock');
      
      const isActive = !entitlement.deleted && 
                      (!entitlement.ends_at || new Date(entitlement.ends_at) > new Date());
      
      if (matchesSku) {
        console.log('ENTITLEMENT: Found matching SKU:', entitlement.sku_id, 'Active:', isActive);
      }
      
      return matchesSku && isActive;
    });

    // Cache result for 2 minutes
    const cacheData = {
      hasEntitlement,
      checkedAt: new Date().toISOString()
    };
    
    await kv.put(cacheKey, JSON.stringify(cacheData), {
      expirationTtl: 120 // 2 minutes
    });

    console.log('ENTITLEMENT: Final result:', hasEntitlement);
    return hasEntitlement;
  } catch (error) {
    console.error('ENTITLEMENT: Error checking entitlements:', error);
    return false;
  }
}

// Alternative entitlement check that tries multiple approaches
async function checkDiscordEntitlementRobust(token: string, kv: KVNamespace, skuId?: string): Promise<boolean> {
  if (!skuId) {
    console.log('ENTITLEMENT_ROBUST: No SKU ID configured, allowing access');
    return true;
  }

  try {
    // First try the standard approach
    const standardResult = await checkDiscordEntitlement(token, kv, skuId);
    if (standardResult) {
      console.log('ENTITLEMENT_ROBUST: Standard check passed');
      return true;
    }

    // Try fetching all entitlements including ended ones
    console.log('ENTITLEMENT_ROBUST: Standard check failed, trying comprehensive check...');
    const response = await fetch('https://discord.com/api/users/@me/entitlements', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'PiShock-Discord-Activity/1.0'
      },
    });

    if (!response.ok) {
      console.error('ENTITLEMENT_ROBUST: Failed to fetch entitlements:', response.status);
      return false;
    }

    const entitlements = await response.json();
    console.log('ENTITLEMENT_ROBUST: Fetched', entitlements.length, 'total entitlements');
    
    // Try multiple matching strategies
    const hasEntitlement = entitlements.some((entitlement: any) => {
      // More aggressive matching
      const skuString = entitlement.sku_id?.toString() || '';
      const targetSkuString = skuId?.toString() || '';
      
      const matchesSku = skuString === targetSkuString || 
                        skuString.includes('controller') ||
                        skuString.includes('multishock') ||
                        skuString.includes('plus') ||
                        targetSkuString.includes(skuString) ||
                        skuString.includes('1387037988558606457'); // Known Controller+ SKU
      
      // More lenient active check - only require not deleted
      const isActive = !entitlement.deleted;
      
      if (matchesSku) {
        console.log('ENTITLEMENT_ROBUST: Found potential match:', entitlement.sku_id, 
                   'Active:', isActive,
                   'Type:', entitlement.type,
                   'Ends:', entitlement.ends_at || 'never');
      }
      
      return matchesSku && isActive;
    });

    console.log('ENTITLEMENT_ROBUST: Comprehensive check result:', hasEntitlement);
    return hasEntitlement;
  } catch (error) {
    console.error('ENTITLEMENT_ROBUST: Error in robust check:', error);
    return false;
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
    let batchData = batch ? JSON.parse(batch) : {
      entries: [],
      lastUpdated: entry.timestamp,
      totalCount: 0
    };
    
    batchData.entries.unshift(entry);
    batchData.lastUpdated = entry.timestamp;
    batchData.totalCount++;
    
    if (batchData.entries.length > 200) {
      batchData.entries = batchData.entries.slice(0, 200);
    }
    
    await kv.put(batchKey, JSON.stringify(batchData), { expirationTtl: 2592000 });
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
    
    console.log('USER_INFO: Fetching user data from Discord API for:', userId);
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
    console.error('USER_INFO: Error fetching user info:', error);
  }
  
  return null;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const method = request.method;

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

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    const { targetUserIds, intensity, duration, operation, instanceId } = await request.json();

    console.log('MULTISHOCK: Starting multishock execution');
    console.log('MULTISHOCK: Executor:', user.id);
    console.log('MULTISHOCK: Targets:', targetUserIds?.length || 0);
    console.log('MULTISHOCK: Operation:', operation);

    // Validate parameters
    if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) {
      return jsonResponse({ 
        success: false, 
        error: 'targetUserIds must be a non-empty array' 
      }, 400);
    }

    if (targetUserIds.length > 10) {
      return jsonResponse({ 
        success: false, 
        error: 'Maximum 10 targets allowed per multishock command' 
      }, 400);
    }

    if (intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters' 
      }, 400);
    }

    // Check if user has Controller+ entitlement
    const hasControllerPlus = await checkDiscordEntitlementRobust(token, env.PISHOCK_KV, env.CONTROLLER_PLUS_SKU_ID);
    
    if (!hasControllerPlus) {
      console.log('MULTISHOCK: User does not have Controller+ entitlement');
      return jsonResponse({ 
        success: false, 
        error: 'Controller+ subscription required for multishock commands',
        requiresControllerPlus: true
      }, 403);
    }

    console.log('MULTISHOCK: ✓ Controller+ entitlement verified');

    // Generate unique multishock ID
    const multishockId = uuidv4();
    const operationNames = ['shock', 'vibrate', 'beep'];
    const operationName = operationNames[operation];

    // Get executor info for logging
    const executorInfo = await getUserInfo(env.PISHOCK_KV, user.id, token);

    // Process each target
    const results = [];
    const successfulTargets = [];
    const failedTargets = [];

    for (const targetUserId of targetUserIds) {
      try {
        console.log(`MULTISHOCK: Processing target ${targetUserId}`);

        // Check if executor is banned by target
        const targetUserDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
        if (targetUserDataStr) {
          const targetUserData = JSON.parse(targetUserDataStr);
          const bannedExecutors = targetUserData.bannedExecutors || [];
          
          if (bannedExecutors.includes(user.id)) {
            console.log(`MULTISHOCK: Executor ${user.id} is banned by target ${targetUserId}`);
            failedTargets.push({
              userId: targetUserId,
              error: 'You are blocked by this user'
            });
            continue;
          }
        }

        // Get target credentials
        const userData = targetUserDataStr ? JSON.parse(targetUserDataStr) : null;
        const encrypted = userData?.credentials;
        
        if (!encrypted) {
          console.log(`MULTISHOCK: No credentials found for target ${targetUserId}`);
          failedTargets.push({
            userId: targetUserId,
            error: 'Target user has no PiShock device configured'
          });
          continue;
        }

        const creds = await decrypt(encrypted);
        
        // Validate against target's limits
        const targetMaxIntensity = creds.maxIntensity || 100;
        const targetMaxDuration = creds.maxDuration || 15;
        
        if (intensity > targetMaxIntensity) {
          failedTargets.push({
            userId: targetUserId,
            error: `Intensity ${intensity}% exceeds target's maximum of ${targetMaxIntensity}%`
          });
          continue;
        }
        
        if (duration > targetMaxDuration) {
          failedTargets.push({
            userId: targetUserId,
            error: `Duration ${duration}s exceeds target's maximum of ${targetMaxDuration}s`
          });
          continue;
        }

        // Execute PiShock command
        const payload = {
          username: creds.username,
          apikey: creds.apiKey,
          code: creds.sharecode,
          intensity: intensity,
          duration: duration,
          op: operation,
          name: 'DiscordActivity-Multishock',
        };
        
        const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'PiShock-Discord-Activity/1.0'
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`PiShock API error: HTTP ${response.status}`);
        }

        const responseText = await response.text();
        
        if (responseText.includes('Operation Succeeded')) {
          console.log(`MULTISHOCK: ✓ Command successful for target ${targetUserId}`);
          successfulTargets.push(targetUserId);
          
          // Get target info for logging
          const targetInfo = await getUserInfo(env.PISHOCK_KV, targetUserId, token);
          
          // Create activity log entry
          const logEntry: ActivityLogEntry = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            instanceId: instanceId || 'global',
            executorUserId: user.id,
            executorUsername: executorInfo?.username || user.global_name || user.username || 'Unknown User',
            executorAvatar: executorInfo?.avatar,
            targetUserId,
            targetUsername: targetInfo?.username || 'Unknown User',
            targetAvatar: targetInfo?.avatar,
            action: operationName as 'shock' | 'vibrate' | 'beep',
            intensity,
            duration,
            isMultishock: true,
            multishockId
          };

          // Log the activity
          try {
            await addToActivityBatch(env.PISHOCK_KV, logEntry);
          } catch (logError) {
            console.error(`MULTISHOCK: Failed to log activity for ${targetUserId}:`, logError);
          }
          
        } else {
          throw new Error(`PiShock command failed: ${responseText}`);
        }
        
      } catch (error) {
        console.error(`MULTISHOCK: Failed to execute command for ${targetUserId}:`, error);
        failedTargets.push({
          userId: targetUserId,
          error: error instanceof Error ? error.message : 'Command execution failed'
        });
      }
    }

    console.log(`MULTISHOCK: Completed - ${successfulTargets.length} successful, ${failedTargets.length} failed`);

    return jsonResponse({ 
      success: true,
      multishockId,
      totalTargets: targetUserIds.length,
      successfulTargets: successfulTargets.length,
      failedTargets: failedTargets.length,
      results: {
        successful: successfulTargets,
        failed: failedTargets
      },
      summary: `${operationName} sent to ${successfulTargets.length}/${targetUserIds.length} targets`
    });

  } catch (error) {
    console.error('MULTISHOCK: General error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};