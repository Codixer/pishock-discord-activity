interface Env {
  PISHOCK_KV: KVNamespace;
  CONTROLLER_PLUS_SKU_ID?: string;
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

// Optimized token validation with user-ID based caching
async function validateDiscordToken(token: string, kv: KVNamespace): Promise<any> {
  try {
    console.log('TOKEN_VALIDATION: Validating Discord token');
    
    // Direct API call without excessive caching
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      console.log('TOKEN_VALIDATION: Token validation failed:', response.status);
      throw new Error('Invalid Discord token');
    }
    
    const userData = await response.json();
    console.log('TOKEN_VALIDATION: ✓ Token validation successful for user:', userData.id);
    
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
    console.log('STATUS: Validating PiShock credentials using V3 API (auth endpoint)');
    console.log('STATUS: Username:', username);
    
    // Auth endpoint remains unchanged in V3 API
    const url = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/1.0',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    
    console.log('STATUS: Response status:', response.status);
    
    if (!response.ok) {
      console.log('STATUS: Authentication failed:', response.status);
      return { valid: false };
    }
    
    const responseText = await response.text();
    console.log('STATUS: Raw response:', responseText.substring(0, 200));
    
    // Try to parse as JSON first
    let authData;
    try {
      authData = JSON.parse(responseText);
      console.log('STATUS: Parsed as JSON:', authData);
    } catch (parseError) {
      // Check if it's a plain number (user ID)
      if (/^\d+$/.test(responseText.trim())) {
        const userId = responseText.trim();
        console.log('STATUS: Found plain text user ID:', userId);
        return { valid: true, userId };
      }
      console.log('STATUS: Failed to parse response');
      return { valid: false };
    }
    
    // Look for UserID field as specified in documentation
    let userId = null;
    
    // Check for UserID field variations (the API actually returns "UserId")
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
    
  } catch (error) {
    console.error('STATUS: PiShock credential validation error:', error);
    return { valid: false };
  }
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

async function checkUserDevices(userId: string, apiKey: string): Promise<{ hasDevices: boolean; devices?: any[] }> {
  try {
    console.log('STATUS: Checking user devices using V3 API');
    console.log('STATUS: User ID:', userId);
    
    // GetUserDevices endpoint remains in V3 API at ps.pishock.com
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?UserId=${userId}&Token=${encodeURIComponent(apiKey)}&api=true`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/1.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('STATUS: Devices response status:', response.status);
    
    if (!response.ok) {
      console.log('STATUS: Device check failed:', response.status);
      return { hasDevices: false };
    }
    
    const responseText = await response.text();
    console.log('STATUS: Devices raw response:', responseText.substring(0, 300));
    
    let devices;
    try {
      devices = JSON.parse(responseText);
      console.log('STATUS: Parsed devices:', devices);
    } catch (parseError) {
      console.log('STATUS: Failed to parse devices JSON');
      return { hasDevices: false };
    }
    
    // Check if user has any devices with shockers (as per documentation format)
    const hasDevices = Array.isArray(devices) && devices.length > 0 && 
                      devices.some(device => device.shockers && Array.isArray(device.shockers) && device.shockers.length > 0);
    
    console.log('STATUS: Has devices result:', hasDevices);
    return { hasDevices, devices: hasDevices ? devices : [] };
  } catch (error) {
    console.error('STATUS: Failed to check user devices:', error);
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
        
        // Validate credentials using Legacy API
        const credentialValidation = await validatePiShockCredentials(creds.apiKey, creds.username);
        isConnected = credentialValidation.valid;
        
        if (isConnected && credentialValidation.userId) {
          piShockUserId = credentialValidation.userId;
          
          // Check for devices using V3 API
          const deviceCheck = await checkUserDevices(credentialValidation.userId, creds.apiKey);
          hasDevice = deviceCheck.hasDevices;
          deviceCount = deviceCheck.devices?.length || 0;
          
          // Update stored PiShock user ID if it changed
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