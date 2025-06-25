interface Env {
  PISHOCK_KV: KVNamespace;
  CONTROLLER_PLUS_SKU_ID?: string;
}

import { validateDiscordToken } from '../../../lib/discord-auth';
import { decrypt, testPiShockOperation, validatePiShockCredentials, checkUserDevices } from '../../../lib/pishock-api';

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

// Heavily optimized entitlement checking
async function checkDiscordEntitlement(token: string, kv: KVNamespace, skuId?: string, userId?: string): Promise<boolean> {
  if (!skuId) {
    return false; // In production, require proper SKU configuration
  }

  try {
    let finalUserId = userId;
    
    // Only fetch user ID if not provided
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
    
    // Much shorter cache to prevent accumulation
    const cacheKey = `ent:${finalUserId}`;
    const cached = await kv.get(cacheKey);
    if (cached) {
      const cachedResult = JSON.parse(cached);
      const cacheAge = Date.now() - new Date(cachedResult.checkedAt).getTime();
      // Ultra-short cache to prevent KV bloat
      if (cacheAge < 30000) { // 30 seconds
        return cachedResult.hasEntitlement;
      }
    }

    // Fetch entitlements
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
    
    // Check for entitlement
    const hasEntitlement = entitlements.some((entitlement: any) => {
      const matchesSku = entitlement.sku_id === skuId || 
                        entitlement.sku_id?.toString().includes('controller_plus') ||
                        entitlement.sku_id?.toString().includes('multishock') ||
                        entitlement.sku_id?.toString().includes('1387037988558606457');
      
      const isNotDeleted = !entitlement.deleted;
      const isNotExpired = !entitlement.ends_at || new Date(entitlement.ends_at) > new Date();
      const isStarted = !entitlement.starts_at || new Date(entitlement.starts_at) <= new Date();
      const isValidType = [1, 3, 4, 5, 7, 8].includes(entitlement.type);
      
      const isActive = isNotDeleted && isNotExpired && isStarted && isValidType;
      console.log('STATUS: Checking entitlement:', {
        skuId: entitlement.sku_id,
        matchesSku,
        isNotDeleted,
        isNotExpired,
        isStarted,
        isValidType,
        isActive
      });
      // Log the entitlement check
      if (matchesSku) {
        console.log('STATUS: Found matching entitlement:', entitlement);
      }
      
      return matchesSku && isActive;
    });

    // Minimal cache data
    const cacheData = {
      hasEntitlement,
      checkedAt: new Date().toISOString()
    };
    
    // Ultra-short cache to prevent bloat
    await kv.put(cacheKey, JSON.stringify(cacheData), {
      expirationTtl: 30
    });

    return hasEntitlement;
  } catch (error) {
    return false;
  }
}

// Cache key generator for user status
function getUserStatusCacheKey(userId: string): string {
  return `cache:user_status:${userId}`;
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

  if (method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Import the optimized token manager
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return new Response('Unauthorized', { status: 401 });

  // Try to get cached validation first
  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });
  
  try {
    // Check Controller+ entitlement
    const hasControllerPlus = await checkDiscordEntitlement(token, env.PISHOCK_KV, env.CONTROLLER_PLUS_SKU_ID, user.id);
    
    // Get all user data from single key
    const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
    const userData = userDataStr ? JSON.parse(userDataStr) : null;
    
    let isConnected = false;
    let hasDevice = false;
    let deviceCount = 0;
    let piShockUserId = userData?.piShockUserId;
    let lastTested = userData?.lastTested;
    let hasOwnDevice = userData?.hasOwnDevice || false;
    let encrypted = userData?.credentials;
    
    let maxIntensity = 100;
    let maxDuration = 15;
    
    if (encrypted) {
      try {
        const creds = await decrypt(encrypted);
        console.log('STATUS: Testing stored credentials for user:', userId);
        
        // Extract max limits from credentials
        maxIntensity = creds.maxIntensity || 100;
        maxDuration = creds.maxDuration || 15;
        
        // Test credentials without device ping for status check
        console.log('STATUS: Validating credentials for user:', userId);
        const credentialValidation = await validatePiShockCredentials(creds.apiKey, creds.username);
        isConnected = credentialValidation.valid;
        
        if (isConnected) {
          piShockUserId = credentialValidation.userId;
          
          // Check for devices using V3 API if we have a user ID
          const deviceCheck = piShockUserId 
            ? await checkUserDevices(piShockUserId, creds.apiKey)
            : { hasDevices: false, devices: [] };
          hasDevice = deviceCheck.hasDevices;
          deviceCount = deviceCheck.devices?.length || 0;
          
          // Update stored PiShock user ID if it changed
          if (piShockUserId !== userData?.piShockUserId) {
            userData.piShockUserId = piShockUserId;
            await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
          }
        } else {
          console.log('STATUS: Credential validation failed:', credentialValidation.error);
        }
        
        // Update last tested timestamp
        userData.lastTested = new Date().toISOString();
        await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
      } catch (error) {
        console.error('STATUS: Error testing stored credentials:', error);
        isConnected = false;
        hasDevice = false;
      }
    }

    const result = { 
      hasCredentials: !!userData?.credentials, 
      isConnected, 
      hasDevice,
      deviceCount,
      hasOwnDevice,
      piShockUserId,
      lastTested,
      isRelay: false, // Personal accounts are never relay
      maxIntensity,
      maxDuration,
      hasControllerPlus
    };
    
    return jsonResponse(result, 200, {
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=15',
    });
  } catch (error) {
    console.error('User PiShock status error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};