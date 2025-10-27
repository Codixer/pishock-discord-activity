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
    
    const userData = await response.json();
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

async function validatePiShockCredentials(apiKey: string, username: string): Promise<{ valid: boolean; userId?: string; error?: string; debugInfo?: any }> {
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
      const errorText = await response.text();
      return { 
        valid: false, 
        error: `Authentication failed: HTTP ${response.status} - ${errorText}`,
        debugInfo: { status: response.status, error: errorText }
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
          userId,
          debugInfo: { type: 'plain_text', value: userId }
        };
      }
      
      return { 
        valid: false, 
        error: 'Invalid response format - not JSON or plain number',
        debugInfo: { parseError: parseError.message, responseText: responseText.substring(0, 200) }
      };
    }

    let userId = null;
    
    if (authData.UserId !== undefined && authData.UserId !== null) {
      userId = authData.UserId.toString();
    }
    else if (authData.UserID !== undefined && authData.UserID !== null) {
      userId = authData.UserID.toString();
    }
    else if (authData.userId !== undefined && authData.userId !== null) {
      userId = authData.userId.toString();
    }
    else if (authData.id !== undefined && authData.id !== null) {
      userId = authData.id.toString();
    }
    else if (typeof authData === 'number') {
      userId = authData.toString();
    }

    if (userId && /^\d+$/.test(userId)) {
      return { 
        valid: true, 
        userId,
        debugInfo: { authData, foundUserId: userId }
      };
    }

    return { 
      valid: false, 
      error: 'No UserID found in API response',
      debugInfo: { authData, availableFields: Object.keys(authData || {}) }
    };

  } catch (error) {
    return { 
      valid: false, 
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      debugInfo: { networkError: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}

async function checkUserDevices(userId: string, apiKey: string): Promise<{ hasDevices: boolean; devices?: any[]; error?: string; debugInfo?: any }> {
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
      const errorText = await response.text();
      return { 
        hasDevices: false, 
        error: `Device check failed: HTTP ${response.status} - ${errorText}`,
        debugInfo: { status: response.status, error: errorText }
      };
    }
    
    const responseText = await response.text();
    
    let devices;
    try {
      devices = JSON.parse(responseText);
    } catch (parseError) {
      return { 
        hasDevices: false, 
        error: 'Invalid devices response format',
        debugInfo: { parseError: parseError.message, responseText: responseText.substring(0, 200) }
      };
    }
    
    const hasDevices = Array.isArray(devices) && devices.length > 0 && 
                      devices.some(device => device.shockers && Array.isArray(device.shockers) && device.shockers.length > 0);
    
    return { 
      hasDevices, 
      devices: hasDevices ? devices : [],
      debugInfo: { deviceCount: devices?.length || 0, devicesWithShockers: devices?.filter(d => d.shockers?.length > 0).length || 0 }
    };
    
  } catch (error) {
    return { 
      hasDevices: false, 
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      debugInfo: { networkError: error instanceof Error ? error.message : 'Unknown error' }
    };
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

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  const user = await validateDiscordToken(token);
  if (!user) {
    return new Response('Invalid token', { status: 401 });
  }

  if (user.id !== userId) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
    const userData = userDataStr ? JSON.parse(userDataStr) : null;
    
    if (!userData?.credentials) {
      return jsonResponse({ 
        success: false, 
        isConnected: false, 
        error: 'No credentials stored for this user' 
      });
    }

    try {
      const creds = await decrypt(userData.credentials);
      
      const credentialValidation = await validatePiShockCredentials(creds.apiKey, creds.username);
      
      let hasDevice = false;
      let deviceCount = 0;
      let deviceDebugInfo = null;
      
      if (credentialValidation.valid && credentialValidation.userId) {
        const deviceCheck = await checkUserDevices(credentialValidation.userId, creds.apiKey);
        hasDevice = deviceCheck.hasDevices;
        deviceCount = deviceCheck.devices?.length || 0;
        deviceDebugInfo = deviceCheck.debugInfo;
        
        userData.piShockUserId = credentialValidation.userId;
        userData.lastTested = new Date().toISOString();
        await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
      }
      
      const result = {
        success: credentialValidation.valid, 
        isConnected: credentialValidation.valid, 
        hasDevice,
        deviceCount,
        piShockUserId: credentialValidation.userId,
        lastTested: userData.lastTested,
        debug: {
          credentialValidation: credentialValidation.debugInfo,
          deviceCheck: deviceDebugInfo,
          storedCredentials: {
            username: creds.username,
            hasApiKey: !!creds.apiKey,
            apiKeyLength: creds.apiKey?.length || 0,
            sharecode: creds.sharecode,
            hasOwnDevice: creds.hasOwnDevice
          }
        }
      };
      
      if (!credentialValidation.valid) {
        result.error = credentialValidation.error || 'Credential validation failed';
      }
      
      return jsonResponse(result);
    } catch (decryptError) {
      return jsonResponse({ 
        success: false, 
        isConnected: false, 
        error: 'Failed to decrypt stored credentials',
        debug: {
          decryptionError: decryptError instanceof Error ? decryptError.message : 'Unknown error'
        }
      });
    }
  } catch (error) {
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      debug: {
        generalError: error instanceof Error ? error.message : 'Unknown error'
      }
    }, 500);
  }
};