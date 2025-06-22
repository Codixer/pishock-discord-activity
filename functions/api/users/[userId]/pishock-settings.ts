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

async function encrypt(data: any): Promise<string> {
  // Simple base64 encoding for now - in production, use proper encryption
  return btoa(JSON.stringify(data));
}

async function validatePiShockCredentials(apiKey: string, username: string): Promise<{ valid: boolean; userId?: string; error?: string; debugInfo?: any }> {
  try {
    console.log('=== PiShock API v3 Validation ===');
    console.log('Username:', username);
    console.log('API Key length:', apiKey.length);

    // Basic input validation
    if (!apiKey || !username || apiKey.trim().length === 0 || username.trim().length === 0) {
      return {
        valid: false,
        error: 'API Key and Username are required',
        debugInfo: { reason: 'empty_credentials' }
      };
    }

    // Use the new v3 API endpoint to validate credentials by attempting to get user devices
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?userId=0&token=${encodeURIComponent(apiKey)}&api=true`;
    console.log('Making request to v3 API:', url);

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'PiShock-Discord-Activity/2.0',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
    } catch (fetchError) {
      console.error('Network error during API call:', fetchError);
      return {
        valid: false,
        error: 'Network error: Failed to connect to PiShock API. Please check your internet connection and try again.',
        debugInfo: { 
          fetchError: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error',
          url: url
        }
      };
    }

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    let responseText;
    try {
      responseText = await response.text();
    } catch (textError) {
      console.error('Failed to read response text:', textError);
      return {
        valid: false,
        error: 'Failed to read API response',
        debugInfo: { textError: textError instanceof Error ? textError.message : 'Unknown text error' }
      };
    }

    console.log('Raw response text:', responseText);
    console.log('Response text length:', responseText.length);

    // Handle empty response
    if (!responseText || responseText.trim().length === 0) {
      console.error('Empty response from PiShock API');
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
      console.log('HTTP error response:', responseText);
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
      console.log('Parsed devices response:', devicesData);
    } catch (parseError) {
      console.log('Failed to parse devices JSON:', parseError);
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
      console.log('Response is not an array:', devicesData);
      return {
        valid: false,
        error: 'PiShock API response missing devices data. This might indicate invalid credentials.',
        debugInfo: { devicesData, responseType: typeof devicesData }
      };
    }

    // Credentials are valid if we got a devices array (even if empty)
    console.log('✓ Successfully validated PiShock credentials via v3 API');
    console.log('✓ Found', devicesData.length, 'devices');
    
    // Extract userId from the first device if available
    let userId = null;
    if (devicesData.length > 0 && devicesData[0].userId) {
      userId = devicesData[0].userId.toString();
    }

    return { 
      valid: true, 
      userId,
      debugInfo: { devicesData, deviceCount: devicesData.length }
    };

  } catch (error) {
    console.error('PiShock credential validation error:', error);
    return { 
      valid: false, 
      error: `Unexpected error while validating credentials: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
      debugInfo: { 
        networkError: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.constructor.name : 'Unknown'
      }
    };
  }
}

async function getUserDevices(apiKey: string, username: string): Promise<{ hasDevices: boolean; devices?: any[]; error?: string; debugInfo?: any }> {
  try {
    console.log('=== Getting user devices (v3 API) ===');
    console.log('Username:', username);
    
    // Use the v3 API to get user devices
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?userId=0&token=${encodeURIComponent(apiKey)}&api=true`;
    console.log('Making devices request to:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/2.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('Devices response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Devices error response:', errorText);
      return { 
        hasDevices: false, 
        error: `Device check failed: HTTP ${response.status}`,
        debugInfo: { status: response.status, error: errorText }
      };
    }
    
    const responseText = await response.text();
    console.log('Devices raw response:', responseText.substring(0, 500));
    
    let devices;
    try {
      devices = JSON.parse(responseText);
      console.log('Parsed devices data:', devices);
    } catch (parseError) {
      console.log('Failed to parse devices JSON:', parseError);
      return { 
        hasDevices: false, 
        error: 'Invalid devices response format',
        debugInfo: { parseError: parseError.message, responseText: responseText.substring(0, 200) }
      };
    }
    
    // Check if user has any devices with shockers
    const hasDevices = Array.isArray(devices) && devices.length > 0 && 
                      devices.some(device => device.shockers && Array.isArray(device.shockers) && device.shockers.length > 0);
    
    console.log('Has devices result:', hasDevices);
    console.log('Device count:', devices?.length || 0);
    
    return { 
      hasDevices, 
      devices: hasDevices ? devices : [],
      debugInfo: { deviceCount: devices?.length || 0, devicesWithShockers: devices?.filter(d => d.shockers?.length > 0).length || 0 }
    };
    
  } catch (error) {
    console.error('Failed to get user devices:', error);
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

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token);
  if (!user) return new Response('Invalid token', { status: 401 });

  // Users can only manage their own PiShock settings
  if (user.id !== userId) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    if (method === 'PUT') {
      const { apiKey, username, maxIntensity, maxDuration } = await request.json();

      if (!apiKey || !username) {
        return jsonResponse({ 
          success: false, 
          error: 'Missing required fields: apiKey and username are required' 
        }, 400);
      }

      // Validate user-provided limits
      const finalMaxIntensity = Math.min(Math.max(parseInt(maxIntensity) || 100, 1), 100);
      const finalMaxDuration = Math.min(Math.max(parseInt(maxDuration) || 15, 1), 15);

      console.log('=== Starting PiShock v3 API validation ===');
      console.log('Username:', username);
      console.log('User limits - Max Intensity:', finalMaxIntensity, 'Max Duration:', finalMaxDuration);

      // Step 1: Validate credentials and get devices using v3 API
      const credentialValidation = await validatePiShockCredentials(apiKey, username);
      
      if (!credentialValidation.valid) {
        console.log('Credential validation failed:', credentialValidation.error);
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

      const piShockUserId = credentialValidation.userId;
      console.log('✓ Credential validation successful, PiShock User ID:', piShockUserId);
      
      // Step 2: Check if user has devices using v3 API
      const deviceCheck = await getUserDevices(apiKey, username);
      console.log('Device check result:', deviceCheck);
      
      const hasDevices = deviceCheck.hasDevices;
      const deviceCount = deviceCheck.devices?.length || 0;

      // Store credentials with user-configured limits
      const credentialsToStore = {
        apiKey,
        username,
        piShockUserId,
        deviceCount,
        maxIntensity: finalMaxIntensity,
        maxDuration: finalMaxDuration,
        lastValidated: new Date().toISOString()
      };
      
      const encrypted = await encrypt(credentialsToStore);
      
      // Batch all user data into a single key to reduce operations
      const userData = {
        credentials: encrypted,
        lastTested: new Date().toISOString(),
        configuredBy: user.id,
        hasDevices,
        piShockUserId,
        deviceCount,
        maxIntensity: finalMaxIntensity,
        maxDuration: finalMaxDuration,
        lastUpdated: new Date().toISOString()
      };
      
      await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));

      console.log('✓ Settings saved successfully for user:', userId);
      
      // Clear the user's status cache so it gets refreshed immediately
      try {
        const statusCacheKey = `cache:user_status:${userId}`;
        await env.PISHOCK_KV.delete(statusCacheKey);
        console.log('✓ Cleared status cache for user:', userId);
      } catch (error) {
        console.warn('Failed to clear status cache:', error);
      }

      return jsonResponse({ 
        success: true, 
        isConnected: true,
        hasDevices,
        deviceCount,
        piShockUserId,
        maxIntensity: finalMaxIntensity,
        maxDuration: finalMaxDuration,
        debug: {
          credentialValidation: credentialValidation.debugInfo,
          deviceCheck: deviceCheck.debugInfo
        }
      });
    }

    if (method === 'DELETE') {
      // Delete the single user data key
      await env.PISHOCK_KV.delete(`user:${userId}:data`);
      
      // Clear cache
      try {
        const statusCacheKey = `cache:user_status:${userId}`;
        await env.PISHOCK_KV.delete(statusCacheKey);
      } catch (error) {
        console.warn('Failed to clear status cache:', error);
      }
      
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