interface Env {
  PISHOCK_KV: KVNamespace;
  CONTROLLER_PLUS_SKU_ID?: string;
}

import { validateDiscordToken } from '../../../lib/discord-auth';
import { encrypt, testPiShockOperation, validatePiShockCredentials, checkUserDevices } from '../../../lib/pishock-api';

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      // Match caching with status endpoint to prevent inconsistency
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
      'Vary': 'Authorization',
    },
  });
}


async function requireAuth(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

// Simplified entitlement check
async function checkDiscordEntitlement(token: string, kv: KVNamespace, skuId?: string, userId?: string): Promise<boolean> {
  if (!skuId) {
    return false; // In production, require proper SKU configuration
  }

  try {
    let finalUserId = userId;
    
    if (!finalUserId) {
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (!userResponse.ok) {
        return false;
      }
      
      const userData = await userResponse.json();
      finalUserId = userData.id;
    }
    
    const cacheKey = `ent:${finalUserId}`;
    const cached = await kv.get(cacheKey);
    if (cached) {
      const cachedResult = JSON.parse(cached);
      const cacheAge = Date.now() - new Date(cachedResult.checkedAt).getTime();
      if (cacheAge < 30000) { // 30 seconds
        return cachedResult.hasEntitlement;
      }
    }

    const entitlementsUrl = new URL('https://discord.com/api/users/@me/entitlements');
    entitlementsUrl.searchParams.set('exclude_ended', 'true');
    entitlementsUrl.searchParams.set('exclude_deleted', 'true');
    
    const response = await fetch(entitlementsUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      // Try to use stale cache if available
      if (cached) {
        const cachedResult = JSON.parse(cached);
        return cachedResult.hasEntitlement;
      }
      return false;
    }

    const entitlements = await response.json();
    
    const hasEntitlement = entitlements.some((entitlement: any) => {
      const matchesSku = entitlement.sku_id === skuId || 
                        entitlement.sku_id?.includes('controller_plus') ||
                        entitlement.sku_id?.includes('multishock');
      
      const isNotDeleted = !entitlement.deleted;
      const isNotExpired = !entitlement.ends_at || new Date(entitlement.ends_at) > new Date();
      const isStarted = !entitlement.starts_at || new Date(entitlement.starts_at) <= new Date();
      const isValidType = [1, 3, 4, 5, 7, 8].includes(entitlement.type);
      
      const isActive = isNotDeleted && isNotExpired && isStarted && isValidType;
      return matchesSku && isActive;
    });

    const cacheData = {
      hasEntitlement,
      checkedAt: new Date().toISOString()
    };
    
    await kv.put(cacheKey, JSON.stringify(cacheData), {
      expirationTtl: 30
    });

    return hasEntitlement;
  } catch (error) {
    return false;
  }
}

// Helper function to check if settings data has changed
function hasSettingsChanged(existing: any, newData: any): boolean {
  if (!existing) return true;
  
  // Compare key fields that would affect functionality
  const existingCreds = existing.credentials ? JSON.parse(atob(existing.credentials)) : {};
  
  return existing.maxIntensity !== newData.maxIntensity ||
         existing.maxDuration !== newData.maxDuration ||
         JSON.stringify(existing.bannedExecutors || []) !== JSON.stringify(newData.bannedExecutors || []) ||
         existingCreds.username !== newData.username ||
         existingCreds.sharecode !== newData.sharecode;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const method = request.method;
  const userId = params.userId as string;

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

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });

  // Users can only manage their own PiShock settings
  if (user.id !== userId) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    if (method === 'GET') {
      // Get all user data from single key
      // Check Controller+ entitlement
      const hasControllerPlus = await checkDiscordEntitlement(token, env.PISHOCK_KV, env.CONTROLLER_PLUS_SKU_ID, user.id);
      
      const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      
      if (!userData?.credentials) {
        return jsonResponse({ 
          hasSettings: false,
          settings: null,
          bannedExecutors: [],
          hasControllerPlus
        });
      }

      try {
        const creds = await decrypt(userData.credentials);
        
        // Return settings without sensitive data (API key)
        const settings = {
          username: creds.username || '',
          sharecode: creds.sharecode || '',
          hasOwnDevice: true, // Always true now
          maxIntensity: creds.maxIntensity || 100,
          maxDuration: creds.maxDuration || 15,
          lastUpdated: userData.lastUpdated,
          piShockUserId: creds.piShockUserId,
          bannedExecutors: userData.bannedExecutors || []
        };
        
        return jsonResponse({ 
          hasSettings: true,
          settings,
          bannedExecutors: userData.bannedExecutors || [],
          hasControllerPlus
        });
      } catch (error) {
        console.error('Failed to decrypt user settings:', error);
        return jsonResponse({ 
          hasSettings: false,
          settings: null,
          bannedExecutors: [],
          hasControllerPlus
        });
      }
    }

    if (method === 'PUT') {
      const { 
        apiKey, 
        username, 
        sharecode, 
        hasOwnDevice, 
        maxIntensity = 100, 
        maxDuration = 15,
        bannedExecutors = []
      } = await request.json();

      // Get existing user data to check if this is an update
      const existingUserDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
      const existingUserData = existingUserDataStr ? JSON.parse(existingUserDataStr) : null;
      const isExistingUser = !!existingUserData?.credentials;
      
      // Check if this is a ban-list-only update
      const isBanListOnlyUpdate = !apiKey && !username && !sharecode && 
                                 Array.isArray(bannedExecutors) && 
                                 isExistingUser;
      
      if (isBanListOnlyUpdate) {
        // Update only the banned executors list
        const updatedUserData = {
          ...existingUserData,
          bannedExecutors: Array.isArray(bannedExecutors) ? bannedExecutors : [],
          lastUpdated: new Date().toISOString()
        };
        
        await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(updatedUserData));
        
        return jsonResponse({ 
          success: true,
          banListUpdated: true,
          bannedExecutors: updatedUserData.bannedExecutors
        });
      } else {
        // Full credential update - validate required fields
        // For new users, all fields are required
        // For existing users, API key is optional (will preserve existing if not provided)
        if (!isExistingUser && (!apiKey || !username || !sharecode)) {
          return jsonResponse({ 
            success: false, 
            error: 'Missing required fields: API Key, Username, and Share Code are all required' 
          }, 400);
        }
        
        if (!username || !sharecode) {
          return jsonResponse({ 
            success: false, 
            error: 'Username and Share Code are required' 
          }, 400);
        }
      }
      
      // Get existing API key if not provided in request
      let finalApiKey = apiKey;
      if (!apiKey && isExistingUser) {
        try {
          const existingCreds = await decrypt(existingUserData.credentials);
          finalApiKey = existingCreds.apiKey;
        } catch (error) {
          return jsonResponse({ 
            success: false, 
            error: 'Failed to preserve existing API key. Please provide your API key.' 
          }, 500);
        }
      }
      
      if (!finalApiKey) {
        return jsonResponse({ 
          success: false, 
          error: 'API Key is required for new accounts or when existing credentials cannot be retrieved' 
        }, 400);
      }

      // Validate max limits
      if (maxIntensity < 1 || maxIntensity > 100) {
        return jsonResponse({ 
          success: false, 
          error: 'Max intensity must be between 1 and 100' 
        }, 400);
      }

      if (maxDuration < 1 || maxDuration > 15) {
        return jsonResponse({ 
          success: false, 
          error: 'Max duration must be between 1 and 15 seconds' 
        }, 400);
      }

      // Step 1: Validate credentials and get UserID using V3 API (auth endpoint unchanged)
      const credentialValidation = await validatePiShockCredentials(finalApiKey, username);
      
      if (!credentialValidation.valid) {
        console.log('Credential validation failed:', credentialValidation.error);
        return jsonResponse({ 
          success: false, 
          isConnected: false, 
          error: credentialValidation.error || 'Invalid PiShock credentials. Please check your API key and username.',
          debug: {
            step: 'credential_validation',
            ...credentialValidation.debugInfo
          }
        });
      }

      const piShockUserId = credentialValidation.userId!;
      
      // Step 2: Check if user has devices using V3 API (endpoint unchanged)
      const deviceCheck = await checkUserDevices(piShockUserId, finalApiKey);
      
      // Step 3: Validate the sharecode using V3 API (always required now)
      let shareCodeValid = true;
      let shareCodeError = null;
      let shareCodeDebug = null;
      
      if (sharecode) {
        const shareCodeValidation = await testPiShockOperation(finalApiKey, username, sharecode);
        shareCodeValid = shareCodeValidation.valid;
        shareCodeError = shareCodeValidation.error || null;
        shareCodeDebug = shareCodeValidation.debugInfo;
        
        if (!shareCodeValid) {
          return jsonResponse({ 
            success: false, 
            isConnected: false, 
            error: shareCodeError || 'Invalid share code. Please check your device share code.',
            debug: {
              step: 'share_code_validation',
              ...shareCodeDebug
            }
          });
        }
      }

      // Determine final configuration
      const finalSharecode = sharecode;
      const actuallyHasDevice = shareCodeValid && deviceCheck.hasDevices;
      
      // Encrypt and store credentials
      const credentialsToStore = {
        apiKey: finalApiKey, // Always have a valid API key at this point
        username,
        sharecode: finalSharecode,
        hasOwnDevice: actuallyHasDevice,
        piShockUserId,
        deviceCount: deviceCheck.devices?.length || 0,
        lastValidated: new Date().toISOString(),
        maxIntensity,
        maxDuration
      };
      
      const encrypted = await encrypt(credentialsToStore);
      
      // Batch all user data into a single key to reduce operations
      const userData = {
        credentials: encrypted,
        lastTested: new Date().toISOString(),
        configuredBy: user.id,
        hasOwnDevice: actuallyHasDevice,
        piShockUserId,
        deviceCount: deviceCheck.devices?.length || 0,
        lastUpdated: new Date().toISOString(),
        bannedExecutors: Array.isArray(bannedExecutors) ? bannedExecutors : []
      };
      
      // Only write if data has actually changed to reduce unnecessary KV operations
      if (hasSettingsChanged(existingUserData, userData)) {
        await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
      }

      return jsonResponse({ 
        success: true, 
        isConnected: true,
        hasOwnDevice: true, // Always true in the new system
        deviceCount: deviceCheck.devices?.length || 0,
        piShockUserId,
        debug: {
          credentialValidation: credentialValidation.debugInfo,
          deviceCheck: deviceCheck.debugInfo,
          shareCodeValidation: shareCodeDebug
        }
      });
    }

    if (method === 'DELETE') {
      // Delete the single user data key
      await env.PISHOCK_KV.delete(`user:${userId}:data`);
      return jsonResponse({ success: true });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('User PiShock settings error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      debug: {
        step: 'general_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }, 500);
  }
};