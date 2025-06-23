interface Env {
  PISHOCK_KV: KVNamespace;
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

async function validateDiscordToken(token: string): Promise<any> {
  try {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error('Invalid Discord token');
    }
    
    return await response.json();
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

// Cache key generator for user status
function getUserStatusCacheKey(userId: string): string {
  return `cache:user_status:${userId}`;
}

// Cache user status for 2 minutes to reduce API calls
async function getCachedUserStatus(kv: KVNamespace, userId: string) {
  try {
    const cacheKey = getUserStatusCacheKey(userId);
    const cached = await kv.get(cacheKey);
    if (cached) {
      const cachedData = JSON.parse(cached);
      // Check if cache is still valid (2 minutes)
      const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
      if (cacheAge < 120000) { // 2 minutes
        console.log('STATUS: Using cached status for user:', userId);
        return cachedData.status;
      }
    }
  } catch (error) {
    console.warn('STATUS: Cache read error:', error);
  }
  return null;
}

async function setCachedUserStatus(kv: KVNamespace, userId: string, status: any) {
  try {
    const cacheKey = getUserStatusCacheKey(userId);
    const cacheData = {
      status,
      timestamp: new Date().toISOString()
    };
    // Cache for 5 minutes with TTL
    await kv.put(cacheKey, JSON.stringify(cacheData), { expirationTtl: 300 });
    console.log('STATUS: Cached status for user:', userId);
  } catch (error) {
    console.warn('STATUS: Cache write error:', error);
  }
}

async function validatePiShockCredentials(apiKey: string, username: string): Promise<{ valid: boolean; userId?: string }> {
  try {
    console.log('STATUS: Validating PiShock credentials');
    console.log('STATUS: Username:', username);
    
    // Authenticate and get the actual user ID
    const authUrl = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    
    const authResponse = await fetch(authUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/4.0',
        'Accept': 'application/json'
      }
    });
    
    if (!authResponse.ok) {
      console.log('STATUS: Auth response not OK:', authResponse.status);
      return { valid: false };
    }
    
    const authData = await authResponse.json();
    if (!authData || !authData.UserId) {
      console.log('STATUS: No user ID in auth response');
      return { valid: false };
    }
    
    const piShockUserId = authData.UserId;
    console.log('STATUS: Got user ID:', piShockUserId);
    
    // Test API access by getting user devices
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?userId=${piShockUserId}&token=${encodeURIComponent(apiKey)}&api=true`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/4.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('STATUS: Response status:', response.status);
    
    if (!response.ok) {
      console.log('STATUS: Authentication failed:', response.status);
      return { valid: false };
    }
    
    const responseText = await response.text();
    console.log('STATUS: Raw response:', responseText.substring(0, 200));
    
    // Try to parse as JSON
    let devicesData;
    try {
      devicesData = JSON.parse(responseText);
      console.log('STATUS: Parsed devices data:', devicesData);
    } catch (parseError) {
      console.log('STATUS: Failed to parse response');
      return { valid: false };
    }
    
    // Check if we got a valid devices array
    if (!Array.isArray(devicesData)) {
      console.log('STATUS: Response is not a devices array');
      return { valid: false };
    }
    
    console.log('STATUS: Found valid credentials with', devicesData.length, 'devices');
    return { valid: true, userId: piShockUserId.toString() };
  } catch (error) {
    console.error('STATUS: PiShock credential validation error:', error);
    return { valid: false };
  }
}

async function checkUserDevices(apiKey: string, username: string): Promise<{ hasDevices: boolean; devices?: any[] }> {
  try {
    console.log('STATUS: Checking user devices');
    console.log('STATUS: Username:', username);
    
    // Get the user ID first
    const authUrl = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    const authResponse = await fetch(authUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/4.0',
        'Accept': 'application/json'
      }
    });
    
    if (!authResponse.ok) {
      console.log('STATUS: Auth failed for device check:', authResponse.status);
      return { hasDevices: false };
    }
    
    const authData = await authResponse.json();
    if (!authData || !authData.UserId) {
      console.log('STATUS: No user ID for device check');
      return { hasDevices: false };
    }
    
    const piShockUserId = authData.UserId;
    
    // Get user devices
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?userId=${piShockUserId}&token=${encodeURIComponent(apiKey)}&api=true`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/4.0',
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
    
    // Check if user has any devices with shockers
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

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    // Try to get cached status first
    const cachedStatus = await getCachedUserStatus(env.PISHOCK_KV, userId);
    if (cachedStatus) {
      const response = new Response(JSON.stringify(cachedStatus), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
          'X-Cache-Status': 'HIT',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
      return response;
    }
    
    // Get all user data from single key
    const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
    const userData = userDataStr ? JSON.parse(userDataStr) : null;
    
    let isConnected = false;
    let hasDevice = false;
    let deviceCount = 0;
    let piShockUserId = userData?.piShockUserId;
    let lastTested = userData?.lastTested;
    let maxIntensity = userData?.maxIntensity || 100;
    let maxDuration = userData?.maxDuration || 15;
    let encrypted = userData?.credentials;
    
    if (encrypted) {
      try {
        const creds = await decrypt(encrypted);
        console.log('STATUS: Testing stored credentials for user:', userId);
        
        // Validate credentials
        const credentialValidation = await validatePiShockCredentials(creds.apiKey, creds.username);
        isConnected = credentialValidation.valid;
        
        if (isConnected && credentialValidation.userId) {
          piShockUserId = credentialValidation.userId;
          
          // Check for devices
          const deviceCheck = await checkUserDevices(creds.apiKey, creds.username);
          hasDevice = deviceCheck.hasDevices;
          deviceCount = deviceCheck.devices?.length || 0;
          
          // Update stored PiShock user ID if it changed
          if (piShockUserId !== userData?.piShockUserId) {
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
      piShockUserId,
      lastTested,
      maxIntensity,
      maxDuration,
      selectedShockerId: userData?.selectedShockerId || null,
      availableShockers: userData?.availableShockers || [],
      selectedSharecode: userData?.selectedSharecode || null,
      availableSharecodes: userData?.availableSharecodes || [],
      isRelay: false // No relay accounts in v4
    };
    
    console.log('STATUS: Final result for user', userId, ':', result);
    
    // Cache the result
    await setCachedUserStatus(env.PISHOCK_KV, userId, result);
    
    return jsonResponse(result);
  } catch (error) {
    console.error('User PiShock status error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};