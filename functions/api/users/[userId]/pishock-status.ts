// Type declarations for Cloudflare Workers
declare global {
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }
}

interface Env {
  PISHOCK_KV: KVNamespace;
  CONTROLLER_PLUS_SKU_ID?: string;
}

interface PagesFunction<Env = unknown> {
  (context: { request: Request; env: Env; params: Record<string, string>; waitUntil: (promise: Promise<any>) => void; passThroughOnException: () => void; }): Promise<Response> | Response;
}

function jsonResponse(body: any, status = 200, additionalHeaders: Record<string, string> = {}) {
  const headers = { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...additionalHeaders
  };
  
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

async function requireAuth(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

// Optimized token validation with user-ID based caching
async function validateDiscordToken(token: string, kv: KVNamespace): Promise<any> {
  try {
    const cacheKey = `discord_token_validation:${token.slice(-8)}`; // Use last 8 chars to avoid storing full token
    const cached = await kv.get(cacheKey);
    if (cached) {
      const cachedData = JSON.parse(cached);
      return cachedData;
    }
    
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      console.log('TOKEN_VALIDATION: Token validation failed:', response.status);
      throw new Error('Invalid Discord token');
    }
    
    const userData = await response.json();
    console.log('TOKEN_VALIDATION: ✓ Token validation successful for user:', userData.id);
    
    await kv.put(cacheKey, JSON.stringify(userData), {
      expirationTtl: 300 // 5 minutes
    });
    
    return userData;
  } catch (error) {
    console.error('TOKEN_VALIDATION: Error validating token:', error);
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

async function validatePiShockCredentials(apiKey: string, username: string): Promise<{ valid: boolean; userId?: string }> {
  try {
    const url = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/1.0',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    
    if (!response.ok) {
      return { valid: false };
    }
    
    const responseText = await response.text();
    
    let authData;
    try {
      authData = JSON.parse(responseText);
    } catch (parseError) {
      if (/^\d+$/.test(responseText.trim())) {
        const userId = responseText.trim();
        return { valid: true, userId };
      }
      return { valid: false };
    }
      // Look for UserID field as specified in documentation
    let userId: string | null = null;
    
    let userId = null;
    
    if (authData.UserId !== undefined && authData.UserId !== null) {
      userId = authData.UserId.toString();
    } else if (authData.UserID !== undefined && authData.UserID !== null) {
      userId = authData.UserID.toString();
    } else if (authData.userId !== undefined && authData.userId !== null) {
      userId = authData.userId.toString();
    } else if (authData.id !== undefined && authData.id !== null) {
      userId = authData.id.toString();
    } else if (typeof authData === 'number') {
      userId = authData.toString();
    }
    
    if (userId && /^\d+$/.test(userId)) {
      return { valid: true, userId };
    } else {
      console.log('STATUS: No valid user ID found in response');
      return { valid: false };
    }
    
    return { valid: false };
  } catch (error) {
    return { valid: false };
  }
}

function getUserStatusCacheKey(userId: string): string {
  return `cache:user_status:${userId}`;
}

async function getCachedUserStatus(kv: KVNamespace, userId: string) {
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
      const cachedData = JSON.parse(cached);
      const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
      if (cacheAge < 60000) {
        return cachedData.status;
      }
    }
  } catch (error) {
    // Silently handle cache errors
  }
  return null;
}

async function setCachedUserStatus(kv: KVNamespace, userId: string, newStatus: any) {
  try {
    const cacheKey = getUserStatusCacheKey(userId);
    
    const existing = await kv.get(cacheKey);
    if (existing) {
      const existingData = JSON.parse(existing);
      const hasChanges = existingData.status?.isConnected !== newStatus.isConnected ||
                        existingData.status?.hasCredentials !== newStatus.hasCredentials ||
                        existingData.status?.maxIntensity !== newStatus.maxIntensity ||
                        existingData.status?.maxDuration !== newStatus.maxDuration;
      
      if (!hasChanges) {
        return;
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
    await kv.put(cacheKey, JSON.stringify(cacheData), { expirationTtl: 120 });
  } catch (error) {
    // Silently handle cache errors
  }
}

async function clearUserStatusCache(kv: KVNamespace, userId: string) {
  try {
    const cacheKey = getUserStatusCacheKey(userId);
    await kv.delete(cacheKey);
  } catch (error) {
    // Silently handle cache errors
  }
}

async function checkUserDevices(userId: string, apiKey: string): Promise<{ hasDevices: boolean; devices?: any[] }> {
  try {
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?UserId=${userId}&Token=${encodeURIComponent(apiKey)}&api=true`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/1.0',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      return { hasDevices: false };
    }
    
    const responseText = await response.text();
    
    let devices;
    try {
      devices = JSON.parse(responseText);
    } catch (parseError) {
      return { hasDevices: false };
    }
    
    const hasDevices = Array.isArray(devices) && devices.length > 0 && 
                      devices.some(device => device.shockers && Array.isArray(device.shockers) && device.shockers.length > 0);
    
    return { hasDevices, devices: hasDevices ? devices : [] };
  } catch (error) {
    return { hasDevices: false };
  }
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

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });
  
  try {
    const cachedStatus = await getCachedUserStatus(env.PISHOCK_KV, userId);
    if (cachedStatus) {
      return jsonResponse(cachedStatus, 200, {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
        'X-Cache-Status': 'HIT'
      });
    }
    
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
        
        maxIntensity = creds.maxIntensity || 100;
        maxDuration = creds.maxDuration || 15;
        
        const credentialValidation = await validatePiShockCredentials(creds.apiKey, creds.username);
        isConnected = credentialValidation.valid;
        
        if (isConnected && credentialValidation.userId) {
          piShockUserId = credentialValidation.userId;
          
          const deviceCheck = await checkUserDevices(credentialValidation.userId, creds.apiKey);
          hasDevice = deviceCheck.hasDevices;
          deviceCount = deviceCheck.devices?.length || 0;
          
          if (piShockUserId !== userData?.piShockUserId) {
            userData.piShockUserId = piShockUserId;
            await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
          }
          
          userData.lastTested = new Date().toISOString();
          await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
        }
      } catch (error) {
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
      isRelay: false,
      maxIntensity,
      maxDuration,
      hasControllerPlus
    };
    
    await setCachedUserStatus(env.PISHOCK_KV, userId, result);
    
    return jsonResponse(result, 200, {
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=15',
    });
  } catch (error) {
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};