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
    console.log('TEST: Validating PiShock credentials using Legacy API');
    console.log('TEST: Username:', username);
    console.log('TEST: API Key length:', apiKey.length);

    // Basic input validation
    if (!apiKey || !username || apiKey.trim().length === 0 || username.trim().length === 0) {
      return {
        valid: false,
        error: 'API Key and Username are required',
        debugInfo: { reason: 'empty_credentials' }
      };
    }
    // Use exact endpoint from Legacy API documentation
    const url = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    console.log('TEST: Making request to:', url);

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'PiShock-Discord-Activity/1.0',
          'Accept': 'application/json, text/plain, */*'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
    } catch (fetchError) {
      console.error('TEST: Network error during API call:', fetchError);
      return {
        valid: false,
        error: 'Network error: Failed to connect to PiShock API',
        debugInfo: { 
          fetchError: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error'
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
          ? 'PiShock API returned empty response. This might indicate invalid credentials.'
          : `PiShock API error: HTTP ${response.status} with empty response.`,
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
        error: `Authentication failed: HTTP ${response.status} - ${responseText}`,
        debugInfo: { status: response.status, error: responseText }
      };
    }


    // Parse the response
    let authData;
    try {
      authData = JSON.parse(responseText);
      console.log('TEST: Parsed JSON response:', authData);
    } catch (parseError) {
      console.log('TEST: Failed to parse as JSON, trying as plain text');
      
      // Sometimes the API returns just a plain number (user ID)
      if (/^\d+$/.test(responseText.trim())) {
        const userId = responseText.trim();
        console.log('TEST: Found plain text user ID:', userId);
        return { 
          valid: true, 
          userId,
          debugInfo: { type: 'plain_text', value: userId }
        };
      }
      
      return { 
        valid: false, 
        error: 'PiShock API returned unexpected response format',
        debugInfo: { 
          parseError: parseError.message, 
          responseText: responseText.substring(0, 200),
          responseLength: responseText.length
        }
      };
    }

    // Look for UserID field as specified in documentation
    let userId = null;
    
    // Check for UserID field variations (the API actually returns "UserId")
    if (authData.UserId !== undefined && authData.UserId !== null) {
      userId = authData.UserId.toString();
      console.log('TEST: Found UserId in response:', userId);
    }
    // Check for UserID field (exact field name from documentation)
    else if (authData.UserID !== undefined && authData.UserID !== null) {
    }
    if (authData.UserID !== undefined && authData.UserID !== null) {
      userId = authData.UserID.toString();
      console.log('TEST: Found UserID in response:', userId);
    }
    // Fallback checks for common variations
    else if (authData.userId !== undefined && authData.userId !== null) {
      userId = authData.userId.toString();
      console.log('TEST: Found userId in response:', userId);
    }
    else if (authData.id !== undefined && authData.id !== null) {
      userId = authData.id.toString();
      console.log('TEST: Found id in response:', userId);
    }
    // Check if the response itself is just a number
    else if (typeof authData === 'number') {
      userId = authData.toString();
      console.log('TEST: Response is a number:', userId);
    }

    if (userId && /^\d+$/.test(userId)) {
      console.log('TEST: ✓ Successfully validated PiShock credentials');
      return { 
        valid: true, 
        userId,
        debugInfo: { authData, foundUserId: userId }
      };
    }

    console.log('TEST: No valid UserID found in response');
    return { 
      valid: false, 
      error: 'PiShock API response missing UserID',
      debugInfo: { authData, availableFields: Object.keys(authData || {}) }
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

async function checkUserDevices(userId: string, apiKey: string): Promise<{ hasDevices: boolean; devices?: any[]; error?: string; debugInfo?: any }> {
  try {
    console.log('TEST: Checking user devices using Legacy API');
    console.log('TEST: User ID:', userId);
    
    // Use exact endpoint from Legacy API documentation
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?UserId=${userId}&Token=${encodeURIComponent(apiKey)}&api=true`;
    console.log('TEST: Making devices request to:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/1.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('TEST: Devices response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('TEST: Devices error response:', errorText);
      return { 
        hasDevices: false, 
        error: `Device check failed: HTTP ${response.status} - ${errorText}`,
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
    
    // Check if user has any devices with shockers (as per documentation format)
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
    console.error('TEST: Invalid method:', method);
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) {
    console.error('TEST: No authorization token provided');
    return new Response('Unauthorized', { status: 401 });
  }

  const user = await validateDiscordToken(token);
  if (!user) {
    console.error('TEST: Invalid Discord token');
    return new Response('Invalid token', { status: 401 });
  }

  // Users can only test their own PiShock settings
  if (user.id !== userId) {
    console.error('TEST: User trying to test someone else\'s settings:', user.id, 'vs', userId);
    return new Response('Forbidden', { status: 403 });
  }

  console.log('=== STARTING PISHOCK TEST (Legacy API) ===');
  console.log('TEST: User ID:', userId);
  console.log('TEST: Discord user:', user.username);

  try {
    // Get all user data from single key
    const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
    const userData = userDataStr ? JSON.parse(userDataStr) : null;
    
    if (!userData?.credentials) {
      console.error('TEST: No credentials stored for user:', userId);
      return jsonResponse({ 
        success: false, 
        isConnected: false, 
        error: 'No credentials stored for this user' 
      });
    }

    console.log('TEST: Found user data with credentials');

    try {
      const creds = await decrypt(userData.credentials);
      console.log('TEST: Successfully decrypted credentials');
      console.log('TEST: Username:', creds.username);
      console.log('TEST: Has API key:', !!creds.apiKey);
      console.log('TEST: API key length:', creds.apiKey?.length || 0);
      console.log('TEST: Share code:', creds.sharecode);
      console.log('TEST: Has own device:', creds.hasOwnDevice);
      
      // Validate credentials using Legacy API
      console.log('TEST: Starting credential validation...');
      const credentialValidation = await validatePiShockCredentials(creds.apiKey, creds.username);
      
      console.log('TEST: Credential validation result:', credentialValidation);
      
      let hasDevice = false;
      let deviceCount = 0;
      let deviceDebugInfo = null;
      
      if (credentialValidation.valid && credentialValidation.userId) {
        console.log('TEST: Credentials valid, checking for devices...');
        // Check for devices using Legacy API
        const deviceCheck = await checkUserDevices(credentialValidation.userId, creds.apiKey);
        hasDevice = deviceCheck.hasDevices;
        deviceCount = deviceCheck.devices?.length || 0;
        deviceDebugInfo = deviceCheck.debugInfo;
        
        console.log('TEST: Device check result:', {
          hasDevices: hasDevice,
          deviceCount,
          error: deviceCheck.error
        });
        
        // Update stored PiShock user ID in user data
        userData.piShockUserId = credentialValidation.userId;
        userData.lastTested = new Date().toISOString();
        await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
      } else {
        console.error('TEST: Credential validation failed:', credentialValidation.error);
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
      
      console.log('TEST: Final result:', result);
      
      if (!credentialValidation.valid) {
        result.error = credentialValidation.error || 'Credential validation failed';
      }
      
      return jsonResponse(result);
    } catch (decryptError) {
      console.error('TEST: Decryption failed:', decryptError);
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
    console.error('TEST: General error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      debug: {
        generalError: error instanceof Error ? error.message : 'Unknown error'
      }
    }, 500);
  }
};