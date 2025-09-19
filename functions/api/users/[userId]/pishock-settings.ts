interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_APPLICATION_ID: string;
  SHOCK_BYPASS_SKU_ID: string;
}

interface PagesFunction<Env = unknown> {
  (context: { request: Request; env: Env; params: Record<string, string>; waitUntil: (promise: Promise<any>) => void; passThroughOnException: () => void; }): Promise<Response> | Response;
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      // No caching for sensitive settings and consumable data
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
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

async function encrypt(data: any): Promise<string> {
  return btoa(JSON.stringify(data));
}

async function decrypt(data: string): Promise<any> {
  return JSON.parse(atob(data));
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
        error: `Authentication failed: HTTP ${response.status}`,
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

    let userId: string | null = null;
    
    if (authData.UserId !== undefined && authData.UserId !== null) {
      userId = authData.UserId.toString();
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
        error: `Device check failed: HTTP ${response.status}`,
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

async function validateShareCode(username: string, apiKey: string, sharecode: string): Promise<{ valid: boolean; error?: string; debugInfo?: any }> {
  try {
    const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PiShock-Discord-Activity/1.0'
      },
      body: JSON.stringify({
        username: username,
        apikey: apiKey,
        code: sharecode,
        intensity: 1,
        duration: 1,
        op: 2, // 2 = beep (least intrusive test)
        name: 'DiscordActivityShareCodeValidation',
      }),
    });
    
    const responseText = await response.text();
    
    if (!response.ok) {
      return { 
        valid: false, 
        error: `Share code validation failed: HTTP ${response.status}`,
        debugInfo: { status: response.status, response: responseText }
      };
    }
    
    if (responseText.includes('Operation Succeeded') || responseText.includes('Operation Attempted.')) {
      return { valid: true, debugInfo: { response: responseText } };
    }
    
    if (responseText.includes("This code doesn't exist")) {
      return { valid: false, error: 'Share code not found. Please check your share code.', debugInfo: { response: responseText } };
    }
    if (responseText.includes('Not Authorized')) {
      return { valid: false, error: 'Not authorized. Please check your credentials.', debugInfo: { response: responseText } };
    }
    if (responseText.includes('Shocker is Paused')) {
      return { valid: false, error: 'Shocker is paused. Please unpause it in the PiShock web panel.', debugInfo: { response: responseText } };
    }
    if (responseText.includes('Device currently not connected')) {
      return { valid: false, error: 'Device is not connected. Please ensure your PiShock device is online.', debugInfo: { response: responseText } };
    }
    if (responseText.includes('already been used by somebody else')) {
      return { valid: false, error: 'Share code is already in use. Please generate a new one.', debugInfo: { response: responseText } };
    }
    
    return { 
      valid: false, 
      error: `Unexpected response: ${responseText}`,
      debugInfo: { response: responseText }
    };
    
  } catch (error) {
    return { 
      valid: false, 
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      debugInfo: { networkError: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}

function hasSettingsChanged(existing: any, newData: any): boolean {
  if (!existing) return true;
  
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
      const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      
      if (!userData?.credentials) {
        return jsonResponse({ 
          hasSettings: false,
          settings: null,
          bannedExecutors: [],
          consumableInventory: {}
        });
      }

      try {
        const creds = await decrypt(userData.credentials);
        
        const settings = {
          username: creds.username || '',
          sharecode: creds.sharecode || '',
          hasOwnDevice: true,
          maxIntensity: creds.maxIntensity || 100,
          maxDuration: creds.maxDuration || 15,
          enableShockBypass: creds.enableShockBypass || false,
          lastUpdated: userData.lastUpdated,
          piShockUserId: creds.piShockUserId,
          bannedExecutors: userData.bannedExecutors || []
        };
        
        return jsonResponse({ 
          hasSettings: true,
          settings,
          bannedExecutors: userData.bannedExecutors || [],
          consumableInventory: userData.consumableInventory || {}
        });
      } catch (error) {
        console.error('Failed to decrypt user settings:', error);
        return jsonResponse({ 
          hasSettings: false,
          settings: null,
          bannedExecutors: [],
          consumableInventory: {}
        });
      }
    }    if (method === 'PUT') {
      const { 
        apiKey, 
        username, 
        sharecode, 
        hasOwnDevice, 
        maxIntensity = 100, 
        maxDuration = 15,
        bannedExecutors = [],
        enableShockBypass = false
      } = await request.json();

      const existingUserDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
      const existingUserData = existingUserDataStr ? JSON.parse(existingUserDataStr) : null;
      const isExistingUser = !!existingUserData?.credentials;
      
      const isBanListOnlyUpdate = !apiKey && !username && !sharecode && 
                                 Array.isArray(bannedExecutors) && 
                                 isExistingUser;
      
      if (isBanListOnlyUpdate) {
        const updatedUserData = {
          ...existingUserData,
          bannedExecutors: Array.isArray(bannedExecutors) ? bannedExecutors : [],
          consumableInventory: existingUserData.consumableInventory || {},
          lastUpdated: new Date().toISOString()
        };
        
        await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(updatedUserData));
        
        return jsonResponse({ 
          success: true,
          banListUpdated: true,
          bannedExecutors: updatedUserData.bannedExecutors,
          consumableInventory: updatedUserData.consumableInventory
        });
      } else {
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

      const credentialValidation = await validatePiShockCredentials(finalApiKey, username);
      
      if (!credentialValidation.valid) {
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
      
      const deviceCheck = await checkUserDevices(piShockUserId, finalApiKey);
        let shareCodeValid = true;
      let shareCodeError: string | null = null;
      let shareCodeDebug: any = null;
      
      if (sharecode) {
        const shareCodeValidation = await validateShareCode(username, finalApiKey, sharecode);
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

      const finalSharecode = sharecode;
      const actuallyHasDevice = shareCodeValid && deviceCheck.hasDevices;
      
      const credentialsToStore = {
        apiKey: finalApiKey,
        username,
        sharecode: finalSharecode,
        hasOwnDevice: actuallyHasDevice,
        piShockUserId,
        deviceCount: deviceCheck.devices?.length || 0,
        lastValidated: new Date().toISOString(),
        maxIntensity,
        maxDuration,
        enableShockBypass
      };
      
      const encrypted = await encrypt(credentialsToStore);
      
      const userData = {
        credentials: encrypted,
        lastTested: new Date().toISOString(),
        configuredBy: user.id,
        hasOwnDevice: actuallyHasDevice,
        piShockUserId,
        deviceCount: deviceCheck.devices?.length || 0,
        lastUpdated: new Date().toISOString(),
        bannedExecutors: Array.isArray(bannedExecutors) ? bannedExecutors : [],
        consumableInventory: existingUserData?.consumableInventory || {}
      };
      
      if (hasSettingsChanged(existingUserData, userData)) {
        await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
      }

      try {
        const cacheKeys = [
          `cache:user_status:${userId}`,
          `user_status_cache:${userId}`,
        ];
        
        await Promise.allSettled(cacheKeys.map(key => env.PISHOCK_KV.delete(key)));
      } catch (error) {
        // Silently handle cache clear errors
      }

      return jsonResponse({ 
        success: true, 
        isConnected: true,
        hasOwnDevice: true,
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