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
  bypassedLimit?: boolean;
  skuConsumed?: string;
}

const SHOCK_PAST_LIMIT_SKU_ID = "1418562984946569267";

async function fetchUserEntitlements(token: string, env: Env, userId?: string): Promise<any[] | null> {
  try {
    if (!env.DISCORD_CLIENT_ID) {
      console.error(`[PISHOCK-EXECUTE] Cannot fetch entitlements: DISCORD_CLIENT_ID not configured`);
      return null;
    }
    
    console.log(`[PISHOCK-EXECUTE] Fetching entitlements for user ${userId || 'current'}`);
    // Use the applications endpoint with application ID
    // GET /applications/{application.id}/entitlements
    // https://discord.com/developers/docs/monetization/entitlements
    let url = `https://discord.com/api/v9/applications/${env.DISCORD_CLIENT_ID}/entitlements`;
    if (userId) {
      url += `?user_id=${userId}`;
    }
    
    console.log(`[PISHOCK-EXECUTE] Fetching from: ${url}`);
    const response = await fetch(url, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    
    console.log(`[PISHOCK-EXECUTE] Entitlements API response: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      // Discord API returns an array directly
      const entitlements = Array.isArray(data) ? data : [];
      console.log(`[PISHOCK-EXECUTE] Fetched ${entitlements.length} entitlements`, {
        isArray: Array.isArray(data),
        entitlements: entitlements.map((ent: any) => ({
          id: ent.id,
          sku_id: ent.sku_id,
          consumed: ent.consumed,
          type: ent.type,
          user_id: ent.user_id
        }))
      });
      return entitlements;
    } else {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[PISHOCK-EXECUTE] Failed to fetch entitlements: ${response.status} ${response.statusText}`, {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
        url
      });
      return null;
    }
  } catch (error) {
    console.error(`[PISHOCK-EXECUTE] Exception while fetching entitlements:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return null;
  }
}

async function consumeEntitlement(token: string, entitlementId: string, applicationId: string): Promise<boolean> {
  try {
    // Use POST method on applications endpoint as per Discord API documentation
    // POST /applications/{application.id}/entitlements/{entitlement.id}/consume
    // https://discord.com/developers/docs/monetization/implementing-one-time-purchases
    const url = `https://discord.com/api/v9/applications/${applicationId}/entitlements/${entitlementId}/consume`;
    console.log(`[PISHOCK-EXECUTE] Consuming entitlement ${entitlementId} via ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    
    console.log(`[PISHOCK-EXECUTE] Consume API response: ${response.status} ${response.statusText}`);
    
    // Discord API returns 204 No Content on success
    if (response.status === 204 || response.ok) {
      console.log(`[PISHOCK-EXECUTE] Successfully consumed entitlement ${entitlementId}`);
      return true;
    } else {
      const errorBody = await response.text();
      console.error(`[PISHOCK-EXECUTE] Failed to consume entitlement ${entitlementId}:`, {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorBody || '(empty)'
      });
      return false;
    }
  } catch (error) {
    console.error(`[PISHOCK-EXECUTE] Exception while consuming entitlement ${entitlementId}:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
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
    
    await kv.put(batchKey, JSON.stringify(batchData), { expirationTtl: 2592000 });
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
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError);
      return jsonResponse({ 
        success: false, 
        error: 'Invalid request body format' 
      }, 400);
    }
    
    const { executorUserId, intensity, duration, operation, bypassLimits = false } = requestBody;

    if (!executorUserId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters' 
      }, 400);
    }

    try {
      const targetUserDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
      if (targetUserDataStr) {
        const targetUserData = JSON.parse(targetUserDataStr);
        const bannedExecutors = targetUserData.bannedExecutors || [];
        
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
      
      const targetMaxIntensity = creds.maxIntensity || 100;
      const targetMaxDuration = creds.maxDuration || 15;
      
      // Check if limit bypass is requested and if limits are actually exceeded
      const limitsExceeded = intensity > targetMaxIntensity || duration > targetMaxDuration;
      const needsBypass = bypassLimits && limitsExceeded;
      let bypassedLimit = false;
      let skuConsumed: string | undefined;
      let entitlementIdToConsume: string | undefined;
      
      if (needsBypass) {
        // Verify 2-sided consent
        const executorUserDataStr = await env.PISHOCK_KV.get(`user:${executorUserId}:data`);
        const executorUserData = executorUserDataStr ? JSON.parse(executorUserDataStr) : null;
        const targetUserDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
        const targetUserData = targetUserDataStr ? JSON.parse(targetUserDataStr) : null;
        
        const executorConsent = executorUserData?.useShockPastLimit || false;
        const targetConsent = targetUserData?.allowShockPastLimit || false;
        
        if (!executorConsent || !targetConsent) {
          return jsonResponse({ 
            success: false, 
            error: `Limit bypass requires consent from both users. Executor consent: ${executorConsent}, Target consent: ${targetConsent}` 
          }, 403);
        }
        
        // Check if executor has available SKU
        const entitlements = await fetchUserEntitlements(token, env, executorUserId);
        if (!entitlements || !Array.isArray(entitlements)) {
          console.error('Failed to fetch entitlements or invalid response:', {
            entitlements,
            isArray: Array.isArray(entitlements),
            executorUserId,
            hasClientId: !!env.DISCORD_CLIENT_ID
          });
          return jsonResponse({ 
            success: false, 
            error: 'Failed to verify SKU entitlement. Please ensure you have purchased the "Shock Past User Limit" consumable and try again.' 
          }, 500);
        }
        
        console.log(`Fetched ${entitlements.length} entitlements for user ${executorUserId}`);
        
        // Check by SKU ID and consumed status, not type (type can be 3 or 4)
            const availableEntitlement = entitlements.find((ent: any) => 
              ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && 
              !(ent.consumed ?? false)
            );
        
        if (!availableEntitlement) {
          console.log(`No available entitlement found. Entitlements:`, entitlements.map((ent: any) => ({
            id: ent.id,
            sku_id: ent.sku_id,
            consumed: ent.consumed,
            type: ent.type
          })));
          return jsonResponse({ 
            success: false, 
            error: 'No available "Shock Past Limit" SKU found. Please purchase more in the Store.' 
          }, 403);
        }
        
        console.log(`Found available entitlement: ${availableEntitlement.id} for SKU ${SHOCK_PAST_LIMIT_SKU_ID}`);
        
        // Store entitlement ID for consumption after successful execution
        entitlementIdToConsume = availableEntitlement.id;
        bypassedLimit = true;
      } else if (limitsExceeded && !bypassLimits) {
        // Limits are exceeded but bypass was not requested
        if (intensity > targetMaxIntensity) {
          return jsonResponse({ 
            success: false, 
            error: `Intensity ${intensity}% exceeds target user's maximum of ${targetMaxIntensity}%` 
          });
        }
        
        if (duration > targetMaxDuration) {
          return jsonResponse({ 
            success: false, 
            error: `Duration ${duration}s exceeds target user's maximum of ${targetMaxDuration}s` 
          });
        }
      }
      
      const operationNames = ['shock', 'vibrate', 'beep'];
      const operationName = operationNames[operation];
      
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
      // PiShock API can return "Operation Succeeded" or "Operation Attempted" as success messages
      const isPiShockSuccess = response.ok && (
        responseText.includes('Operation Succeeded') || 
        responseText.includes('Operation Attempted')
      );

      if (!isPiShockSuccess) {
        let errorMessage = `PiShock API error: HTTP ${response.status} - ${responseText}`;
        if (responseText.includes("This code doesn't exist")) {
          errorMessage = 'Share code not found. Please check device configuration.';
        } else if (responseText.includes('Not Authorized')) {
          errorMessage = 'Not authorized. Please check API credentials.';
        } else if (responseText.includes('Shocker is Paused')) {
          errorMessage = 'Device is paused. Please unpause it in the PiShock web panel.';
        } else if (responseText.includes('Device currently not connected')) {
          errorMessage = 'Device is not connected. Please ensure the device is online.';
        } else if (responseText.includes('already been used by somebody else')) {
          errorMessage = 'Share code is already in use. Please generate a new one.';
        } else if (responseText.includes('Unknown Op')) {
          errorMessage = 'Invalid operation specified.';
        } else if (responseText.includes('Intensity must be between')) {
          errorMessage = 'Invalid intensity specified.';
        } else if (responseText.includes('Duration must be between')) {
          errorMessage = 'Invalid duration specified.';
        }
        throw new Error(errorMessage);
      }

      // Command successful - now consume SKU if limit was bypassed
      if (bypassedLimit && entitlementIdToConsume) {
        console.log(`[PISHOCK-EXECUTE] Attempting to consume entitlement ${entitlementIdToConsume} after successful command`);
        // Re-fetch entitlements to get the latest state before consuming
        const latestEntitlements = await fetchUserEntitlements(token, env, executorUserId);
        if (latestEntitlements && Array.isArray(latestEntitlements)) {
          console.log(`[PISHOCK-EXECUTE] Found ${latestEntitlements.length} entitlements, searching for ${entitlementIdToConsume}`);
          const latestEntitlement = latestEntitlements.find((ent: any) => 
            ent.id === entitlementIdToConsume && 
            ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && 
            !ent.consumed
          );
          
          if (latestEntitlement) {
            console.log(`[PISHOCK-EXECUTE] Found unconsumed entitlement:`, {
              id: latestEntitlement.id,
              sku_id: latestEntitlement.sku_id,
              consumed: latestEntitlement.consumed,
              type: latestEntitlement.type
            });
            
            if (!env.DISCORD_CLIENT_ID) {
              console.error(`[PISHOCK-EXECUTE] Cannot consume entitlement: DISCORD_CLIENT_ID not configured`);
            } else {
              const consumed = await consumeEntitlement(token, latestEntitlement.id, env.DISCORD_CLIENT_ID);
              if (consumed) {
                console.log(`[PISHOCK-EXECUTE] Successfully consumed entitlement ${latestEntitlement.id}`);
                skuConsumed = SHOCK_PAST_LIMIT_SKU_ID;
                // Invalidate SKU status cache
                try {
                  await env.PISHOCK_KV.delete(`cache:sku_status:${executorUserId}`);
                  await env.PISHOCK_KV.delete(`sku_verify_cache:${executorUserId}`);
                } catch (error) {
                  console.error(`[PISHOCK-EXECUTE] Error invalidating cache:`, error);
                }
              } else {
                // Log error but don't fail the command since it already succeeded
                console.error(`[PISHOCK-EXECUTE] Failed to consume SKU ${SHOCK_PAST_LIMIT_SKU_ID} for user ${executorUserId} after successful command execution. Command succeeded but SKU was not consumed.`, {
                  entitlementId: latestEntitlement.id,
                  executorUserId
                });
              }
            }
          } else {
            console.warn(`[PISHOCK-EXECUTE] Entitlement ${entitlementIdToConsume} not found or already consumed when attempting to consume after successful command.`, {
              entitlementId: entitlementIdToConsume,
              availableEntitlements: latestEntitlements.map((ent: any) => ({
                id: ent.id,
                sku_id: ent.sku_id,
                consumed: ent.consumed,
                type: ent.type
              }))
            });
          }
        } else {
          console.error(`[PISHOCK-EXECUTE] Failed to fetch entitlements for consumption:`, {
            latestEntitlements,
            isArray: Array.isArray(latestEntitlements)
          });
        }
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
        bypassedLimit: bypassedLimit || undefined,
        skuConsumed: skuConsumed || undefined,
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
        consumeSku: bypassedLimit && entitlementIdToConsume ? { entitlementId: entitlementIdToConsume, skuId: SHOCK_PAST_LIMIT_SKU_ID } : undefined,
      });

    } catch (error) {
      console.error('Error executing PiShock command:', error);
      console.error('Error details:', {
        executorUserId: typeof executorUserId !== 'undefined' ? executorUserId : 'undefined',
        targetUserId,
        intensity: typeof intensity !== 'undefined' ? intensity : 'undefined',
        duration: typeof duration !== 'undefined' ? duration : 'undefined',
        operation: typeof operation !== 'undefined' ? operation : 'undefined',
        bypassLimits: typeof bypassLimits !== 'undefined' ? bypassLimits : 'undefined',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return jsonResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Command execution failed' 
      });
    }
  } catch (error) {
    console.error('Error in pishock-execute endpoint:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : undefined
    }, 500);
  }
};