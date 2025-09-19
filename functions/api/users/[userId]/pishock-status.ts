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
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=30', // 1 minute cache for status
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
      return cachedData;
    }
    
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error('Invalid Discord token');
    }
    
    const userData = await response.json();
    
    await kv.put(cacheKey, JSON.stringify(userData), {
      expirationTtl: 300 // 5 minutes
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

async function validatePiShockCredentials(apiKey: string, username: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
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
      return { 
        valid: false, 
        error: `Authentication failed: HTTP ${response.status}`
      };
    }

    const responseText = await response.text();

    let authData;
    try {
      authData = JSON.parse(responseText);
    } catch (parseError) {
      if (/^\d+$/.test(responseText.trim())) {
        const userId = responseText.trim();
        return { 
          valid: true, 
          userId
        };
      }
      
      return { 
        valid: false, 
        error: 'Invalid response format'
      };
    }

    let userId: string | null = null;
    
    if (authData.UserId !== undefined && authData.UserId !== null) {
      userId = authData.UserId.toString();
    } else if (authData.id !== undefined && authData.id !== null) {
      userId = authData.id.toString();
    } else if (typeof authData === 'number') {
      userId = authData.toString();
    }

    if (userId && /^\d+$/.test(userId)) {
      return { 
        valid: true, 
        userId
      };
    }

    return { 
      valid: false, 
      error: 'No UserID found in API response'
    };

  } catch (error) {
    return { 
      valid: false, 
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

async function checkUserDevices(userId: string, apiKey: string): Promise<{ hasDevices: boolean; devices?: any[]; error?: string }> {
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
      return { 
        hasDevices: false, 
        error: `Device check failed: HTTP ${response.status}`
      };
    }
    
    const responseText = await response.text();
    
    let devices;
    try {
      devices = JSON.parse(responseText);
    } catch (parseError) {
      return { 
        hasDevices: false, 
        error: 'Invalid devices response format'
      };
    }
    
    const hasDevices = Array.isArray(devices) && devices.length > 0 && 
                      devices.some(device => device.shockers && Array.isArray(device.shockers) && device.shockers.length > 0);
    
    return { 
      hasDevices, 
      devices: hasDevices ? devices : []
    };
    
  } catch (error) {
    return { 
      hasDevices: false, 
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

async function getConsumableInventory(token: string, userId: string): Promise<Record<string, number>> {
  try {
    // This would typically call Discord's API to get user's consumable inventory
    // For now, return empty inventory as a placeholder
    return {};
  } catch (error) {
    console.warn('Failed to get consumable inventory:', error);
    return {};
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
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) {
    return new Response('Invalid token', { status: 401 });
  }

  try {
    // Get user's PiShock data
    const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
    const userData = userDataStr ? JSON.parse(userDataStr) : null;
    
    if (!userData?.credentials) {
      return jsonResponse({ 
        isConnected: false,
        hasDevice: false,
        hasCredentials: false,
        deviceCount: 0,
        piShockUserId: null,
        isRelay: false,
        maxIntensity: 100,
        maxDuration: 15,
        bannedExecutors: userData?.bannedExecutors || [],
        consumableInventory: {}
      });
    }

    try {
      const creds = await decrypt(userData.credentials);
      
      // Validate credentials
      const credentialValidation = await validatePiShockCredentials(creds.apiKey, creds.username);
      
      let hasDevice = false;
      let deviceCount = 0;
      let consumableInventory = {};
      
      if (credentialValidation.valid && credentialValidation.userId) {
        // Check for devices
        const deviceCheck = await checkUserDevices(credentialValidation.userId, creds.apiKey);
        hasDevice = deviceCheck.hasDevices;
        deviceCount = deviceCheck.devices?.length || 0;
        
        // Get consumable inventory if this is the requesting user
        if (user.id === userId) {
          consumableInventory = await getConsumableInventory(token, userId);
          
          // Update stored consumable inventory
          userData.consumableInventory = consumableInventory;
          await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
        }
      }
      
      return jsonResponse({
        isConnected: credentialValidation.valid,
        hasDevice,
        hasCredentials: true,
        deviceCount,
        piShockUserId: credentialValidation.userId,
        isRelay: false,
        maxIntensity: creds.maxIntensity || 100,
        maxDuration: creds.maxDuration || 15,
        enableShockBypass: creds.enableShockBypass || false,
        bannedExecutors: userData.bannedExecutors || [],
        consumableInventory: userData.consumableInventory || {}
      });
      
    } catch (decryptError) {
      return jsonResponse({ 
        isConnected: false,
        hasDevice: false,
        hasCredentials: false,
        deviceCount: 0,
        piShockUserId: null,
        isRelay: false,
        maxIntensity: 100,
        maxDuration: 15,
        bannedExecutors: userData?.bannedExecutors || [],
        consumableInventory: {}
      });
    }
  } catch (error) {
    console.error('User PiShock status error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};