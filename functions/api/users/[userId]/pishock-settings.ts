interface Env {
  PISHOCK_KV: KVNamespace;
}

interface PagesFunction<Env = any> {
  (context: { request: Request; env: Env; params: Record<string, string>; }): Promise<Response> | Response;
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
        error: 'API key and username are required',
        debugInfo: { missingFields: { apiKey: !apiKey, username: !username } }
      };
    }

    // First, authenticate and get the actual user ID
    const authUrl = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    console.log('Authenticating with auth endpoint');

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
      console.error('Auth fetch error:', fetchError);
      return { 
        valid: false, 
        error: `Network error during authentication: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`,
        debugInfo: { authNetworkError: fetchError instanceof Error ? fetchError.message : 'Unknown error' }
      };
    }

    console.log('Auth response status:', authResponse.status);

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
      console.log('Auth response text:', authText);
      authData = JSON.parse(authText);
    } catch (parseError) {
      console.error('Auth parse error:', parseError);
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

    const userId = authData.UserId;
    console.log('✓ Authentication successful, user ID:', userId);

    // Now use the actual user ID to validate by getting devices
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?userId=${userId}&token=${encodeURIComponent(apiKey)}&api=true`;
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
    
    return { 
      valid: true, 
      userId: userId.toString(),
      debugInfo: { devicesData, deviceCount: devicesData.length, piShockUserId: userId }
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

async function getUserDevices(apiKey: string, username: string): Promise<{ hasDevices: boolean; devices?: any[]; availableShockers?: any[]; error?: string; debugInfo?: any }> {
  try {
    console.log('=== Getting user devices (v3 API) ===');
    console.log('Username:', username);
    
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
      return { 
        hasDevices: false, 
        error: `Authentication failed: HTTP ${authResponse.status}`,
        debugInfo: { authStatus: authResponse.status }
      };
    }
    
    const authData = await authResponse.json();
    if (!authData || !authData.UserId) {
      return { 
        hasDevices: false, 
        error: 'Failed to get user ID',
        debugInfo: { authData }
      };
    }
    
    const userId = authData.UserId;
    console.log('Got user ID:', userId);
    
    // Now use the actual user ID to get devices
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?userId=${userId}&token=${encodeURIComponent(apiKey)}&api=true`;
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
    
    // Extract all available shockers from all devices
    const availableShockers: any[] = [];
    if (Array.isArray(devices)) {
      devices.forEach(device => {
        if (device.shockers && Array.isArray(device.shockers)) {
          device.shockers.forEach(shocker => {
            availableShockers.push({
              shockerId: shocker.shockerId,
              shockerName: shocker.shockerName || `Shocker ${shocker.shockerId}`,
              deviceId: device.clientId,
              deviceName: device.name || `Device ${device.clientId}`,
              displayName: `${shocker.shockerName || `Shocker ${shocker.shockerId}`} (${device.name || `Device ${device.clientId}`})`
            });
          });
        }
      });
    }
    
    // Check if user has any devices with shockers
    const hasDevices = availableShockers.length > 0;
    
    console.log('Has devices result:', hasDevices);
    console.log('Device count:', devices?.length || 0);
    console.log('Available shockers:', availableShockers.length);
    
    return { 
      hasDevices, 
      devices: hasDevices ? devices : [],
      availableShockers,
      debugInfo: { 
        deviceCount: devices?.length || 0, 
        devicesWithShockers: devices?.filter(d => d.shockers?.length > 0).length || 0,
        totalShockers: availableShockers.length,
        piShockUserId: userId
      }
    };
    
  } catch (error) {
    console.error('Failed to get user devices:', error);
    return { 
      hasDevices: false, 
      availableShockers: [],
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      debugInfo: { networkError: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}

async function getDeviceSharecodes(apiKey: string, username: string, deviceId?: string): Promise<{ success: boolean; sharecodes?: any[]; error?: string; debugInfo?: any }> {
  try {
    console.log('Getting device sharecodes...', deviceId ? `for device ${deviceId}` : 'for all devices');
    
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
      return { 
        success: false, 
        error: `Authentication failed: HTTP ${authResponse.status}`,
        debugInfo: { authStatus: authResponse.status }
      };
    }
    
    const authData = await authResponse.json();
    if (!authData || !authData.UserId) {
      return { 
        success: false, 
        error: 'Failed to get user ID',
        debugInfo: { authData }
      };
    }
    
    const userId = authData.UserId;
    console.log('Getting sharecodes for user ID:', userId);
    
    // Use the correct endpoint for getting sharecodes by owner
    // If deviceId is provided, filter for that specific device, otherwise get all
    const url = `https://ps.pishock.com/PiShock/GetShareCodesByOwner?userId=${userId}&token=${encodeURIComponent(apiKey)}&api=true`;
    console.log('Making sharecodes request to:', url);    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/2.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('Sharecodes response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Sharecodes error response:', errorText);
      return { 
        success: false, 
        error: `Sharecodes fetch failed: HTTP ${response.status}`,
        debugInfo: { status: response.status, error: errorText }
      };
    }
    
    const responseText = await response.text();
    console.log('Sharecodes raw response:', responseText.substring(0, 500));
    
    let sharecodesData;
    try {
      sharecodesData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse sharecodes response:', parseError);
      return { 
        success: false, 
        error: 'Invalid sharecodes response format',
        debugInfo: { parseError: parseError instanceof Error ? parseError.message : 'Unknown parse error' }
      };    }    console.log('Parsed sharecodes data:', sharecodesData);
    
    // Handle the API response format - it returns an object with arrays of share IDs as values
    let allShareIds: number[] = [];
    if (typeof sharecodesData === 'object' && sharecodesData !== null) {
      // Extract arrays from the object values
      Object.values(sharecodesData).forEach((value: any) => {
        if (Array.isArray(value)) {
          allShareIds = allShareIds.concat(value);
        }
      });
    } else if (Array.isArray(sharecodesData)) {
      // Fallback to direct array format
      allShareIds = sharecodesData;
    }

    if (allShareIds.length === 0) {
      console.log('No share IDs found in response');
      return { 
        success: true, 
        sharecodes: [],
        debugInfo: { 
          sharecodesCount: 0,
          userId,
          deviceId,
          responseFormat: typeof sharecodesData 
        }
      };
    }
    
    // Convert share IDs to objects for frontend compatibility
    const sharecodesArray = allShareIds.map(shareId => ({
      shareId: shareId,
      code: shareId.toString(),
      shareCode: shareId.toString(),
      name: `Share Code ${shareId}`
    }));
    
    // Filter by device ID if provided (though this won't work since share IDs don't contain device info)
    let filteredSharecodes = sharecodesArray;
    if (deviceId) {
      console.log(`Device filtering not applicable for share IDs - returning all ${sharecodesArray.length} sharecodes`);
    }
    
    console.log('✓ Found', filteredSharecodes.length, 'share codes');
    
    return {
      success: true,
      sharecodes: filteredSharecodes,
      debugInfo: { 
        sharecodesCount: filteredSharecodes.length,
        totalSharecodes: allShareIds.length,
        userId,
        deviceId,
        responseFormat: typeof sharecodesData
      }
    };
      } catch (error) {
    console.error('Failed to get device sharecodes:', error);
    return { 
      success: false, 
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
      const { apiKey, username, maxIntensity, maxDuration, selectedShockerId, selectedSharecode } = await request.json();

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
      console.log('Selected Shocker ID:', selectedShockerId);

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
      const availableShockers = deviceCheck.availableShockers || [];

      // Step 3: Get available sharecodes
      const sharecodesCheck = await getDeviceSharecodes(apiKey, username);
      console.log('Sharecodes check result:', sharecodesCheck);
      
      const availableSharecodes = sharecodesCheck.success ? sharecodesCheck.sharecodes || [] : [];

      // Validate selected sharecode if provided
      let validatedSharecode = null;
      if (selectedSharecode) {
        const isValidSharecode = availableSharecodes.some(sc => sc.code === selectedSharecode || sc.shareCode === selectedSharecode);
        if (isValidSharecode) {
          validatedSharecode = selectedSharecode;
          console.log('✓ Selected sharecode validated:', validatedSharecode);
        } else {
          console.warn('Selected sharecode not found in available sharecodes');
        }
      }

      // Validate selected shocker if provided
      let validatedShockerId = null;
      if (selectedShockerId) {
        const isValidShocker = availableShockers.some(shocker => shocker.shockerId.toString() === selectedShockerId.toString());
        if (isValidShocker) {
          validatedShockerId = selectedShockerId.toString();
          console.log('✓ Selected shocker validated:', validatedShockerId);
        } else {
          console.warn('Selected shocker not found in available shockers, using automatic selection');
        }
      }

      // If no valid selected shocker, use the first available one
      if (!validatedShockerId && availableShockers.length > 0) {
        validatedShockerId = availableShockers[0].shockerId.toString();
        console.log('✓ Auto-selected first available shocker:', validatedShockerId);
      }      // Store credentials with user-configured limits, selected shocker, and selected sharecode
      const credentialsToStore = {
        apiKey,
        username,
        piShockUserId,
        deviceCount,
        maxIntensity: finalMaxIntensity,
        maxDuration: finalMaxDuration,
        selectedShockerId: validatedShockerId,
        selectedSharecode: validatedSharecode,
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
        selectedShockerId: validatedShockerId,
        availableShockers,
        selectedSharecode: validatedSharecode,
        availableSharecodes,
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
      }      return jsonResponse({ 
        success: true, 
        isConnected: true,
        hasDevices,
        deviceCount,
        piShockUserId,
        maxIntensity: finalMaxIntensity,
        maxDuration: finalMaxDuration,
        selectedShockerId: validatedShockerId,
        availableShockers,
        selectedSharecode: validatedSharecode,
        availableSharecodes,
        debug: {
          credentialValidation: credentialValidation.debugInfo,
          deviceCheck: deviceCheck.debugInfo,
          sharecodesCheck: sharecodesCheck.debugInfo
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