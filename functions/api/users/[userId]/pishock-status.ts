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

async function validateDiscordToken(token: string, kv: KVNamespace): Promise<any> {
  try {
    // Try to get cached validation result first
    const cacheKey = `discord_token_validation:${token.slice(-8)}`; // Use last 8 chars to avoid storing full token
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
    
    // Cache the validation result for 5 minutes
    await kv.put(cacheKey, JSON.stringify(userData), {
      expirationTtl: 300 // 5 minutes
    });
    
    console.log('TOKEN_VALIDATION: ✓ Cached fresh Discord token validation');
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
    
    if (userId && /^\d+$/.test(userId)) {
      console.log('STATUS: Found valid user ID:', userId);
      return { valid: true, userId };
    }
    
    console.log('STATUS: No valid user ID found');
    return { valid: false };
  } catch (error) {
    console.error('STATUS: PiShock credential validation error:', error);
    return { valid: false };
  }
}

async function checkDiscordEntitlement(token: string, kv: KVNamespace, skuId?: string): Promise<boolean> {
  if (!skuId) {
    console.log('ENTITLEMENT: No SKU ID configured, allowing access for development');
    return true; // Allow access if no SKU is configured (development mode)
  }

  try {
    const cacheKey = `entitlement:${token.slice(-8)}:${skuId}`;
    const cached = await kv.get(cacheKey);
    if (cached) {
      const cachedResult = JSON.parse(cached);
      console.log('ENTITLEMENT: Using cached entitlement result:', cachedResult.hasEntitlement);
      return cachedResult.hasEntitlement;
    }

    console.log('ENTITLEMENT: Checking Discord entitlements for SKU:', skuId);
    
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

// Cache key generator for user status
function getUserStatusCacheKey(userId: string): string {
  return `cache:user_status:${userId}`;
}

// Optimized cache management with conditional writes
async function getCachedUserStatus(kv: KVNamespace, userId: string) {
  try {
    const cacheKey = getUserStatusCacheKey(userId);
    const cached = await kv.get(cacheKey);
    if (cached) {
      const cachedData = JSON.parse(cached);
      // Check if cache is still valid (1 minute for faster updates)
      const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
      if (cacheAge < 60000) { // 1 minute
        console.log('STATUS: Using cached status for user:', userId);
        return cachedData.status;
      }
    }
  } catch (error) {
    console.warn('STATUS: Cache read error:', error);
  }
  return null;
}

// Only write to cache if data has actually changed
async function setCachedUserStatus(kv: KVNamespace, userId: string, newStatus: any) {
  try {
    const cacheKey = getUserStatusCacheKey(userId);
    
    // Check existing cache to avoid unnecessary writes
    const existing = await kv.get(cacheKey);
    if (existing) {
      const existingData = JSON.parse(existing);
      // Compare key status fields to see if update is needed
      const hasChanges = existingData.status?.isConnected !== newStatus.isConnected ||
                        existingData.status?.hasCredentials !== newStatus.hasCredentials ||
                        existingData.status?.maxIntensity !== newStatus.maxIntensity ||
                        existingData.status?.maxDuration !== newStatus.maxDuration;
      
      if (!hasChanges) {
        console.log('STATUS: No changes detected, skipping cache write for user:', userId);
        return;
      }
    }
    
    const cacheData = {
      status: newStatus,
      timestamp: new Date().toISOString()
    };
    // Cache for 2 minutes with TTL
    await kv.put(cacheKey, JSON.stringify(cacheData), { expirationTtl: 120 });
    console.log('STATUS: Updated cache for user:', userId, 'isConnected:', newStatus.isConnected);
  } catch (error) {
    console.warn('STATUS: Cache write error:', error);
  }
}

// Function to clear cache for a specific user
async function clearUserStatusCache(kv: KVNamespace, userId: string) {
  try {
    const cacheKey = getUserStatusCacheKey(userId);
    await kv.delete(cacheKey);
    console.log('STATUS: Cleared cache for user:', userId);
  } catch (error) {
    console.warn('STATUS: Cache clear error:', error);
  }
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
    console.log('STATUS API: Checking status for user:', userId);
    
    // Try to get cached status first
    const cachedStatus = await getCachedUserStatus(env.PISHOCK_KV, userId);
    if (cachedStatus) {
      console.log('STATUS API: Returning cached status for user:', userId);
      return jsonResponse(cachedStatus, 200, {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
        'X-Cache-Status': 'HIT'
      });
    }
    
    // Check Controller+ entitlement
    const hasControllerPlus = await checkDiscordEntitlement(token, env.PISHOCK_KV, env.CONTROLLER_PLUS_SKU_ID);
    
    // Get all user data from single key
    console.log('STATUS API: Loading fresh data for user:', userId);
    const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
    const userData = userDataStr ? JSON.parse(userDataStr) : null;
    
    console.log('STATUS API: User data found:', !!userData, 'Has credentials:', !!userData?.credentials);
    if (userData) {
      console.log('STATUS API: User data structure:', {
        hasCredentials: !!userData.credentials,
        credentialsType: typeof userData.credentials,
        credentialsLength: userData.credentials?.length || 0,
        otherKeys: Object.keys(userData).filter(k => k !== 'credentials')
      });
    }
    
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
            // Update the user data with new PiShock ID
            userData.piShockUserId = piShockUserId;
            await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
          }
          
          // Update last tested timestamp
          userData.lastTested = new Date().toISOString();
          await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
          
          console.log('STATUS: Connection test successful for user:', userId);
        } else {
          console.log('STATUS: Connection test failed for user:', userId);
        }
      } catch (error) {
        console.error('STATUS: Failed to test stored credentials:', error);
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
    
    console.log('STATUS: Final result for user', userId, ':', result);
    
    // Cache the result
    await setCachedUserStatus(env.PISHOCK_KV, userId, result);
    
    return jsonResponse(result, 200, {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
      'X-Cache-Status': 'MISS'
    });
  } catch (error) {
    console.error('User PiShock status error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};