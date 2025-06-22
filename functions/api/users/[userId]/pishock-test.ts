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

async function validatePiShockCredentials(apiKey: string, username: string): Promise<{ valid: boolean; userId?: string; error?: string; debugInfo?: any }> {
  try {
    console.log('TEST: Validating PiShock credentials using v3 API');
    console.log('TEST: Username:', username);
    console.log('TEST: API Key length:', apiKey.length);

    // Basic input validation
    if (!apiKey || !username || apiKey.trim().length === 0 || username.trim().length === 0) {
      return { 
        valid: false, 
        error: 'API key and username are required',
        debugInfo: { missingFields: { apiKey: !apiKey, username: !username } }
      };
    }

    // First, authenticate and get the actual user ID
    const authUrl = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    console.log('TEST: Authenticating with auth endpoint');

    let authResponse;
    try {
      authResponse = await fetch(authUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'PiShock-Discord-Activity/2.0',
          'Accept': 'application/json'
        }
      });
    } catch (fetchError) {
      console.error('TEST: Auth fetch error:', fetchError);
      return { 
        valid: false, 
        error: `Network error during authentication: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
        debugInfo: { authNetworkError: fetchError instanceof Error ? fetchError.message : 'Unknown error' }
      };
    }

    console.log('TEST: Auth response status:', authResponse.status);

    if (!authResponse.ok) {
      return { 
        valid: false, 
        error: `Authentication failed: HTTP ${authResponse.status}. Please check your API key and username.`,
        debugInfo: { authStatus: authResponse.status }
      };
    }

    let authData;
    try {
      const authText = await authResponse.text();
      console.log('TEST: Auth response text:', authText);
      authData = JSON.parse(authText);
    } catch (parseError) {
      console.error('TEST: Auth parse error:', parseError);
      return { 
        valid: false, 
        error: 'Invalid authentication response format',
        debugInfo: { authParseError: parseError instanceof Error ? parseError.message : 'Unknown error' }
      };
    }

    if (!authData || !authData.UserId) {
      return { 
        valid: false, 
        error: 'Invalid credentials - authentication failed',
        debugInfo: { authData }
      };
    }

    const piShockUserId = authData.UserId;
    console.log('TEST: ✓ Authentication successful, user ID:', piShockUserId);

    // Use the v3 API to validate credentials by attempting to get user devices
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?userId=${piShockUserId}&token=${encodeURIComponent(apiKey)}&api=true`;
    console.log('TEST: Making request to v3 API:', url);

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'PiShock-Discord-Activity/2.0',
          'Accept': 'application/json'
        }
      });
    } catch (fetchError) {
      console.error('TEST: Network error during API call:', fetchError);
      return { 
        valid: false, 
        error: `Network error: Failed to connect to PiShock API. Please check your internet connection and try again.`,
        debugInfo: { 
          fetchError: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error',
          url: url
        }
      };
    }

    console.log('TEST: Response status:', response.status);
    console.log('TEST: Response headers:', Object.fromEntries(response.headers.entries()));

    let responseText;
    try {
      responseText = await response.text();
    } catch (textError) {
      console.error('TEST: Failed to read response text:', textError);
      return { 
        valid: false, 
        error: 'Failed to read API response',
        debugInfo: { textError: textError instanceof Error ? textError.message : 'Unknown text error' }
      };
    }

    console.log('TEST: Raw response text:', responseText);
    console.log('TEST: Response text length:', responseText.length);

    // Handle empty response
    if (!responseText || responseText.trim().length === 0) {
      console.error('TEST: Empty response from PiShock API');
      return { 
        valid: false, 
        error: response.ok 
          ? 'PiShock API returned empty response. This might indicate invalid credentials or a temporary API issue.'
          : `PiShock API error: HTTP ${response.status} with empty response. Please check your credentials and try again.`,
        debugInfo: { 
          status: response.status,
          emptyResponse: true,
          responseLength: responseText.length
        }
      };
    }

    if (!response.ok) {
      console.log('TEST: HTTP error response:', responseText);
      return { 
        valid: false, 
        error: `PiShock API authentication failed: HTTP ${response.status}. ${responseText || 'Please check your credentials.'}`,
        debugInfo: { status: response.status, error: responseText }
      };
    }

    // Parse the response
    let devicesData;
    try {
      devicesData = JSON.parse(responseText);
      console.log('TEST: Parsed devices response:', devicesData);
    } catch (parseError) {
      console.log('TEST: Failed to parse devices JSON:', parseError);
      return { 
        valid: false, 
        error: 'PiShock API returned unexpected response format. This might indicate invalid credentials or an API issue.',
        debugInfo: { 
          parseError: parseError.message, 
          responseText: responseText.substring(0, 200),
          responseLength: responseText.length
        }
      };
    }

    // Check if we got a valid devices array
    if (!Array.isArray(devicesData)) {
      console.log('TEST: Response is not an array:', devicesData);
      return { 
        valid: false, 
        error: 'PiShock API response missing devices data. This might indicate invalid credentials.',
        debugInfo: { devicesData, responseType: typeof devicesData }
      };
    }

    console.log('TEST: ✓ Successfully validated PiShock credentials');
    return { 
      valid: true, 
      userId: piShockUserId.toString(),
      debugInfo: { devicesData, deviceCount: devicesData.length }
    };

  } catch (error) {
    console.error('TEST: PiShock credential validation error:', error);
    return { 
      valid: false, 
      error: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      debugInfo: { 
        networkError: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown'
      }
    };
  }
}

async function checkUserDevices(apiKey: string, username: string): Promise<{ hasDevices: boolean; devices?: any[]; error?: string; debugInfo?: any }> {
  try {
    console.log('TEST: Checking user devices using v3 API');
    console.log('TEST: Username:', username);
    
    // First get the user ID
    const authUrl = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    const authResponse = await fetch(authUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/2.0',
        'Accept': 'application/json'
      }
    });
    
    if (!authResponse.ok) {
      console.log('TEST: Auth failed for device check:', authResponse.status);
      return { hasDevices: false, error: `Auth failed: ${authResponse.status}` };
    }
    
    const authData = await authResponse.json();
    if (!authData || !authData.UserId) {
      console.log('TEST: No user ID for device check');
      return { hasDevices: false, error: 'No user ID' };
    }
    
    const piShockUserId = authData.UserId;
    
    // Use the v3 API to get user devices
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?userId=${piShockUserId}&token=${encodeURIComponent(apiKey)}&api=true`;
    console.log('TEST: Making devices request to:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/2.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('TEST: Devices response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('TEST: Devices error response:', errorText);
      return { 
        hasDevices: false, 
        error: `Device check failed: HTTP ${response.status}`,
        debugInfo: { status: response.status, error: errorText }
      };
    }
    
    const responseText = await response.text();
    console.log('TEST: Devices raw response:', responseText.substring(0, 500));
    
    let devices;
    try {
      devices = JSON.parse(responseText);
      console.log('TEST: Parsed devices data:', devices);
    } catch (parseError) {
      console.log('TEST: Failed to parse devices JSON:', parseError);
      return { 
        hasDevices: false, 
        error: 'Invalid devices response format',
        debugInfo: { parseError: parseError.message, responseText: responseText.substring(0, 200) }
      };
    }
    
    // Check if user has any devices with shockers
    const hasDevices = Array.isArray(devices) && devices.length > 0 && 
                      devices.some(device => device.shockers && Array.isArray(device.shockers) && device.shockers.length > 0);
    
    console.log('TEST: Has devices result:', hasDevices);
    console.log('TEST: Device count:', devices?.length || 0);
    
    return { 
      hasDevices, 
      devices: hasDevices ? devices : [],
      debugInfo: { deviceCount: devices?.length || 0, devicesWithShockers: devices?.filter(d => d.shockers?.length > 0).length || 0 }
    };
    
  } catch (error) {
    console.error('TEST: Failed to check user devices:', error);
    return { 
      hasDevices: false, 
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      debugInfo: { networkError: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}

export const onRequest = async (context: { request: Request; env: Env; params: Record<string, string> }) => {
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
    return jsonResponse({ 
      success: false, 
      error: 'Authorization required' 
    }, 401);
  }

  const user = await validateDiscordToken(token);
  if (!user) {
    return jsonResponse({ 
      success: false, 
      error: 'Invalid authorization token' 
    }, 401);
  }

  // Users can only test their own PiShock settings
  if (user.id !== userId) {
    return jsonResponse({ 
      success: false, 
      error: 'You can only test your own PiShock settings' 
    }, 403);
  }

  console.log('=== STARTING PISHOCK TEST (v3 API) ===');
  console.log('TEST: User ID:', userId);
  console.log('TEST: Discord user:', user.username);

  try {
    // Get stored credentials
    const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
    if (!userDataStr) {
      return jsonResponse({
        success: false,
        isConnected: false,
        hasDevice: false,
        error: 'No PiShock credentials found. Please configure your settings first.',
        debug: {
          step: 'get_credentials',
          userDataExists: false
        }
      });
    }

    const userData = JSON.parse(userDataStr);
    if (!userData?.credentials) {
      return jsonResponse({
        success: false,
        isConnected: false,
        hasDevice: false,
        error: 'No PiShock credentials found. Please configure your settings first.',
        debug: {
          step: 'get_credentials',
          credentialsExists: false,
          userData
        }
      });
    }

    // Decrypt credentials
    let creds;
    try {
      creds = await decrypt(userData.credentials);
    } catch (error) {
      return jsonResponse({
        success: false,
        isConnected: false,
        hasDevice: false,
        error: 'Failed to decrypt stored credentials',
        debug: {
          step: 'decrypt_credentials',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }

    console.log('TEST: Testing credentials for user:', creds.username);

    // Test credentials
    const credentialValidation = await validatePiShockCredentials(creds.apiKey, creds.username);
    console.log('TEST: Credential validation result:', credentialValidation);

    // Test device access
    const deviceCheck = await checkUserDevices(creds.apiKey, creds.username);
    console.log('TEST: Device check result:', deviceCheck);

    const result = {
      success: credentialValidation.valid,
      isConnected: credentialValidation.valid,
      hasDevice: deviceCheck.hasDevices,
      deviceCount: deviceCheck.devices?.length || 0,
      piShockUserId: credentialValidation.userId,
      maxIntensity: userData.maxIntensity,
      maxDuration: userData.maxDuration,
      lastTested: new Date().toISOString(),
      debug: {
        credentialValidation: credentialValidation.debugInfo,
        deviceCheck: deviceCheck.debugInfo,
        storedCredentials: {
          username: creds.username,
          hasApiKey: !!creds.apiKey,
          apiKeyLength: creds.apiKey?.length || 0
        }
      }
    };

    if (!credentialValidation.valid) {
      return jsonResponse({
        ...result,
        error: credentialValidation.error || 'Credential validation failed'
      });
    }

    if (!deviceCheck.hasDevices) {
      return jsonResponse({
        ...result,
        error: deviceCheck.error || 'No devices with shockers found'
      });
    }

    // Update the last tested timestamp
    userData.lastTested = result.lastTested;
    await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));

    return jsonResponse(result);

  } catch (error) {
    console.error('TEST: Unexpected error:', error);
    return jsonResponse({
      success: false,
      isConnected: false,
      hasDevice: false,
      error: 'Internal server error during test',
      debug: {
        step: 'general_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }, 500);
  }
};
