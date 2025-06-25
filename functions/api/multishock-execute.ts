import { validateDiscordToken, getUserInfo } from '../lib/discord-auth';

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

      // Check if entitlement is not deleted
      if (entitlement.deleted) return false;

      // Check if entitlement has started (if starts_at is specified)
      if (entitlement.starts_at && new Date(entitlement.starts_at) > now) return false;

      // Check if entitlement hasn't ended (if ends_at is specified)
      if (entitlement.ends_at && new Date(entitlement.ends_at) <= now) return false;

      // Check entitlement type (valid types from Discord docs)
      const validTypes = [1, 3, 4, 5, 7, 8]; // Valid entitlement types per Discord
      if (!validTypes.includes(entitlement.type)) return false;

      return true;
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

    console.log('ENTITLEMENTS: Final result:', { 
      hasEntitlement, 
      entitlementCount: entitlements.length,
      activeEntitlements: entitlements.filter((e: any) => !e.deleted && (!e.ends_at || new Date(e.ends_at) > now)).length
    });

    return { hasEntitlement, entitlements };
  } catch (error) {
    console.error('ENTITLEMENTS: Check failed:', error);
    return { hasEntitlement: false };
  }
}

import { decrypt } from '../lib/pishock-api';

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
          
          // Get target's maximum limits
          const targetMaxIntensity = creds.maxIntensity || 100;
          const targetMaxDuration = creds.maxDuration || 15;
          
          // Calculate effective values for this specific target
          // Use the MINIMUM of requested value and target's maximum
          const effectiveIntensity = Math.min(intensity, targetMaxIntensity);
          const effectiveDuration = Math.min(duration, targetMaxDuration);
          
          console.log(`MULTISHOCK: Target ${targetUserId} - Requested: ${intensity}%/${duration}s, Effective: ${effectiveIntensity}%/${effectiveDuration}s`);

          // Execute PiShock command with effective values
          const payload = {
            username: creds.username,
            apikey: creds.apiKey,
            code: creds.sharecode,
            intensity: effectiveIntensity, // Use effective intensity for this target
            duration: effectiveDuration,   // Use effective duration for this target
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
            
            // Create activity log entry with EFFECTIVE values used for this target
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
              intensity: effectiveIntensity, // Log the actual intensity used
              duration: effectiveDuration,   // Log the actual duration used
              isMultishock: true,
              multishockId
            };

            // Log the activity
            try {
              await addToActivityBatch(env.PISHOCK_KV, logEntry);
            } catch (logError) {
              console.error('Failed to log multishock activity:', logError);
            }
            
          } else {
            throw new Error(`PiShock command failed: ${responseText}`);
          }
        
        } catch (error) {
          console.error(`Multishock failed for target ${targetUserId}:`, error);
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

    } catch (error) {
      console.error('MULTISHOCK: General error:', error);
      return jsonResponse({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, 500);
    }
}