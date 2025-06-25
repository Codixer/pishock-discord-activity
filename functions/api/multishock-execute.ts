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

// Streamlined token validation
async function validateDiscordToken(token: string, kv: KVNamespace): Promise<any> {
  try {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error('Invalid Discord token');
    }
    
    const userData = await response.json();
    return userData;
  } catch (error) {
    return null;
  }
}

// Streamlined entitlement check
async function checkDiscordEntitlement(token: string, kv: KVNamespace, skuId?: string, userId?: string): Promise<{ hasEntitlement: boolean; entitlements?: any[] }> {
  if (!skuId) {
    return { hasEntitlement: false }; // In production, require proper SKU configuration
  }

  try {
    let finalUserId = userId;
    
    if (!finalUserId) {
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (!userResponse.ok) {
        return { hasEntitlement: false };
      }
      
      const userData = await userResponse.json();
      finalUserId = userData.id;
    }
    
    // Use shorter cache key to prevent accumulation
    const cacheKey = `ent:${finalUserId}`;
    const cached = await kv.get(cacheKey);
    if (cached) {
      const cachedResult = JSON.parse(cached);
      const cacheAge = Date.now() - new Date(cachedResult.checkedAt).getTime();
      if (cacheAge < 60000) { // 1 minute cache
        return { 
          hasEntitlement: cachedResult.hasEntitlement,
          entitlements: cachedResult.entitlements 
        };
      }
    }

    // Fetch entitlements from Discord (using proper endpoint)
    const entitlementsUrl = new URL('https://discord.com/api/users/@me/entitlements');
    entitlementsUrl.searchParams.set('exclude_ended', 'true'); // Only active entitlements
    entitlementsUrl.searchParams.set('exclude_deleted', 'true'); // Exclude deleted entitlements
    
    const response = await fetch(entitlementsUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // Try to use stale cache if available
      if (cached) {
        const cachedResult = JSON.parse(cached);
        console.log('ENTITLEMENT: Using stale cache due to API error:', cachedResult.hasEntitlement);
        return { 
          hasEntitlement: cachedResult.hasEntitlement,
          entitlements: cachedResult.entitlements 
        };
      }
      return { hasEntitlement: false };
    }

    const entitlements = await response.json();

    // Check if user has the Controller+ SKU with proper validation
    const now = new Date();
    const hasEntitlement = entitlements.some((entitlement: any) => {
      // Check SKU match
      const matchesSku = entitlement.sku_id === skuId || 
                        entitlement.sku_id?.includes('controller_plus') ||
                        entitlement.sku_id?.includes('multishock');
      
      if (!matchesSku) return false;

      // Comprehensive validation according to Discord entitlement docs
      const isNotDeleted = !entitlement.deleted;
      const isNotExpired = !entitlement.ends_at || new Date(entitlement.ends_at) > now;
      const isStarted = !entitlement.starts_at || new Date(entitlement.starts_at) <= now;
      const isValidType = [1, 3, 4, 5, 7, 8].includes(entitlement.type); // Valid entitlement types
      
      const isActive = isNotDeleted && isNotExpired && isStarted && isValidType;
      
      console.log('ENTITLEMENT: Checking entitlement:', {
        id: entitlement.id,
        sku_id: entitlement.sku_id,
        type: entitlement.type,
        deleted: entitlement.deleted,
        starts_at: entitlement.starts_at,
        ends_at: entitlement.ends_at,
        matchesSku,
        isActive
      });
      
      return matchesSku && isActive;
    });

    // Cache the result with entitlements data
    const cacheData = {
      hasEntitlement,
      entitlements: entitlements.filter((e: any) => !e.deleted), // Only store non-deleted entitlements
      checkedAt: new Date().toISOString(),
      entitlementCount: entitlements.length
    };
    
    // Cache for 1 minute to balance freshness with performance
    await kv.put(cacheKey, JSON.stringify(cacheData), { 
      expirationTtl: 60 
    });

    console.log('ENTITLEMENT: Final result:', { 
      hasEntitlement, 
      entitlementCount: entitlements.length,
      activeEntitlements: entitlements.filter((e: any) => !e.deleted && (!e.ends_at || new Date(e.ends_at) > now)).length
    });
  } catch (error) {
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
    const entitlementCheck = await checkDiscordEntitlement(token, env.PISHOCK_KV, env.CONTROLLER_PLUS_SKU_ID, user.id);
    const hasControllerPlus = entitlementCheck.hasEntitlement;
    
    if (!hasControllerPlus) {
      return jsonResponse({ 
        success: false, 
        error: 'Controller+ subscription required for multishock commands',
        requiresControllerPlus: true,
        entitlementInfo: {
          skuId: env.CONTROLLER_PLUS_SKU_ID,
          entitlementCount: entitlementCheck.entitlements?.length || 0,
          message: 'Upgrade to Controller+ to use multishock commands'
        }
      }, 403);
    }


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

        // Check if executor is banned by target
        const targetUserDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
        if (targetUserDataStr) {
          const targetUserData = JSON.parse(targetUserDataStr);
          const bannedExecutors = targetUserData.bannedExecutors || [];
          
          if (bannedExecutors.includes(user.id)) {
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
          }
          
        } else {
          throw new Error(`PiShock command failed: ${responseText}`);
        }
        
      } catch (error) {
        failedTargets.push({
          userId: targetUserId,
          error: error instanceof Error ? error.message : 'Command execution failed'
        });
      }
    }


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

    return { hasEntitlement, entitlements };
  } catch (error) {
    console.error('ENTITLEMENT: Check failed:', error);
    console.error('MULTISHOCK: General error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }
    )
    return { hasEntitlement: false };
  }
};