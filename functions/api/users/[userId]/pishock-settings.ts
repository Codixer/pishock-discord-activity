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
  return btoa(JSON.stringify(data));
}

async function validatePiShockCredentials(apiKey: string, username: string): Promise<{ valid: boolean; userId?: string; error?: string; debugInfo?: any }> {
  try {
    console.log('SETTINGS: Validating PiShock credentials');
    console.log('SETTINGS: Username:', username);
    console.log('SETTINGS: API Key length:', apiKey.length);

    if (!apiKey || !username || apiKey.trim().length === 0 || username.trim().length === 0) {
      return { 
        valid: false, 
        error: 'API key and username are required',
        debugInfo: { missingFields: { apiKey: !apiKey, username: !username } }
      };
    }

    // Authenticate and get the actual user ID
    const authUrl = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    console.log('SETTINGS: Authenticating with auth endpoint');

    const authResponse = await fetch(authUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/4.0',
        'Accept': 'application/json'
      }
    });

    console.log('SETTINGS: Auth response status:', authResponse.status);

    if (!authResponse.ok) {
      return { 
        valid: false, 
        error: `Authentication failed: HTTP ${authResponse.status}. Please check your API key and username.`,
        debugInfo: { authStatus: authResponse.status }
      };
    }

    const authText = await authResponse.text();
    console.log('SETTINGS: Auth response text:', authText);
    
    let authData;
    try {
      authData = JSON.parse(authText);
    } catch (parseError) {
      console.error('SETTINGS: Auth parse error:', parseError);
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
    console.log('SETTINGS: ✓ Authentication successful, user ID:', piShockUserId);

    // Test API access by getting user devices
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?userId=${piShockUserId}&token=${encodeURIComponent(apiKey)}&api=true`;
    console.log('SETTINGS: Testing API access');

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/4.0',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });

    console.log('SETTINGS: API test response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('SETTINGS: API test error response:', errorText);
      return { 
        valid: false, 
        error: `API access failed: HTTP ${response.status}. ${errorText || 'Please check your credentials.'}`,
        debugInfo: { status: response.status, error: errorText }
      };
    }

    const responseText = await response.text();
    console.log('SETTINGS: API test raw response:', responseText.substring(0, 500));

    let devicesData;
    try {
      devicesData = JSON.parse(responseText);
      console.log('SETTINGS: Parsed devices response:', devicesData);
    } catch (parseError) {
      console.log('SETTINGS: Failed to parse devices JSON:', parseError);
      return { 
        valid: false, 
        error: 'API returned unexpected response format. This might indicate invalid credentials or an API issue.',
        debugInfo: { 
          parseError: parseError instanceof Error ? parseError.message : 'Unknown error', 
          responseText: responseText.substring(0, 200),
          responseLength: responseText.length
        }
      };
    }

    if (!Array.isArray(devicesData)) {
      console.log('SETTINGS: Response is not an array:', devicesData);
      return { 
        valid: false, 
        error: 'API response missing devices data. This might indicate invalid credentials.',
        debugInfo: { devicesData, responseType: typeof devicesData }
      };
    }

    console.log('SETTINGS: ✓ Successfully validated PiShock credentials');
    console.log('SETTINGS: ✓ Found', devicesData.length, 'devices');
    
    return { 
      valid: true, 
      userId: piShockUserId.toString(),
      debugInfo: { devicesData, deviceCount: devicesData.length, piShockUserId }
    };

  } catch (error) {
    console.error('SETTINGS: PiShock credential validation error:', error);
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
    console.log('SETTINGS: Getting user devices');
    console.log('SETTINGS: Username:', username);
    
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
    console.log('SETTINGS: Got user ID:', userId);
    
    // Get user devices
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?userId=${userId}&token=${encodeURIComponent(apiKey)}&api=true`;
    console.log('SETTINGS: Making devices request');
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/4.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('SETTINGS: Devices response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('SETTINGS: Devices error response:', errorText);
      return { 
        hasDevices: false, 
        error: `Device check failed: HTTP ${response.status}`,
        debugInfo: { status: response.status, error: errorText }
      };
    }
    
    const responseText = await response.text();
    console.log('SETTINGS: Devices raw response:', responseText.substring(0, 500));
    
    let devices;
    try {
      devices = JSON.parse(responseText);
      console.log('SETTINGS: Parsed devices data:', devices);
    } catch (parseError) {
      console.log('SETTINGS: Failed to parse devices JSON:', parseError);
      return { 
        hasDevices: false, 
        error: 'Invalid devices response format',
        debugInfo: { 
          parseError: parseError instanceof Error ? parseError.message : 'Unknown parse error',
          responseText: responseText.substring(0, 200)
        }
      };
    }
    
    // Extract available shockers from all devices
    const availableShockers: any[] = [];
    if (Array.isArray(devices)) {
      devices.forEach(device => {
        if (device.shockers && Array.isArray(device.shockers)) {
          device.shockers.forEach((shocker: any) => {
            availableShockers.push({
              shockerId: shocker.shockerId,
              shockerName: shocker.name || shocker.shockerName || `Shocker ${shocker.shockerId}`,
              deviceId: device.clientId,
              deviceName: device.name || `Device ${device.clientId}`,
              displayName: `${shocker.name || shocker.shockerName || `Shocker ${shocker.shockerId}`} (${device.name || `Device ${device.clientId}`})`
            });
          });
        }
      });
    }
    
    const hasDevices = availableShockers.length > 0;
    
    console.log('SETTINGS: Has devices result:', hasDevices);
    console.log('SETTINGS: Device count:', devices?.length || 0);
    console.log('SETTINGS: Available shockers:', availableShockers.length);
    
    return { 
      hasDevices, 
      devices: hasDevices ? devices : [],
      availableShockers,
      debugInfo: { 
        deviceCount: devices?.length || 0, 
        devicesWithShockers: devices?.filter((d: any) => d.shockers?.length > 0).length || 0,
        totalShockers: availableShockers.length,
        piShockUserId: userId
      }
    };
    
  } catch (error) {
    console.error('SETTINGS: Failed to get user devices:', error);
    return { 
      hasDevices: false, 
      availableShockers: [],
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      debugInfo: { networkError: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}

async function getDeviceSharecodes(apiKey: string, username: string): Promise<{ success: boolean; sharecodes?: any[]; error?: string; debugInfo?: any }> {
  try {
    console.log('SETTINGS: Getting device sharecodes');
    
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
    console.log('SETTINGS: Getting sharecodes for user ID:', userId);
    
    // Get sharecodes by owner
    const url = `https://ps.pishock.com/PiShock/GetShareCodesByOwner?userId=${userId}&token=${encodeURIComponent(apiKey)}&api=true`;
    console.log('SETTINGS: Making sharecodes request');
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/4.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('SETTINGS: Sharecodes response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('SETTINGS: Sharecodes error response:', errorText);
      return { 
        success: false, 
        error: `Sharecodes fetch failed: HTTP ${response.status}`,
        debugInfo: { status: response.status, error: errorText }
      };
    }
    
    const responseText = await response.text();
    console.log('SETTINGS: Sharecodes raw response:', responseText.substring(0, 500));
    
    let sharecodesData;
    try {
      sharecodesData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('SETTINGS: Failed to parse sharecodes response:', parseError);
      return { 
        success: false, 
        error: 'Invalid sharecodes response format',
        debugInfo: { 
          parseError: parseError instanceof Error ? parseError.message : 'Unknown parse error',
          responseText: responseText.substring(0, 200)
        }
      };
    }
    
    console.log('SETTINGS: Parsed sharecodes data:', sharecodesData);
    
    // Extract share IDs from the response
    let allShareIds: number[] = [];
    if (typeof sharecodesData === 'object' && sharecodesData !== null) {
      Object.values(sharecodesData).forEach((value: any) => {
        if (Array.isArray(value)) {
          allShareIds = allShareIds.concat(value);
        }
      });
    } else if (Array.isArray(sharecodesData)) {
      allShareIds = sharecodesData;
    }

    if (allShareIds.length === 0) {
      console.log('SETTINGS: No share IDs found in response');
      return { 
        success: true, 
        sharecodes: [],
        debugInfo: { 
          sharecodesCount: 0,
          userId,
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
    
    console.log('SETTINGS: ✓ Found', sharecodesArray.length, 'share codes');
    
    return {
      success: true,
      sharecodes: sharecodesArray,
      debugInfo: { 
        sharecodesCount: sharecodesArray.length,
        totalSharecodes: allShareIds.length,
        userId,
        responseFormat: typeof sharecodesData
      }
    };
    
  } catch (error) {
    console.error('SETTINGS: Failed to get device sharecodes:', error);
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
    if (method === 'GET') {
      // Return existing stored credentials (without sensitive data)
      const storedDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
      const storedData = storedDataStr ? JSON.parse(storedDataStr) : null;
      
      if (!storedData?.credentials) {
        return jsonResponse({
          success: false,
          error: 'No stored credentials found',
          credentials: null
        });
      }
      
      try {
        // Decrypt credentials to return them to the user
        const dataString = atob(storedData.credentials);
        const credentials = JSON.parse(dataString);
        
        return jsonResponse({
          success: true,
          credentials: {
            apiKey: credentials.apiKey || '',
            username: credentials.username || ''
          },
          settings: {
            maxIntensity: storedData.maxIntensity || 100,
            maxDuration: storedData.maxDuration || 15,
            selectedShockerId: storedData.selectedShockerId || null,
            selectedSharecode: storedData.selectedSharecode || null
          }
        });
      } catch (decryptError) {
        return jsonResponse({
          success: false,
          error: 'Failed to decrypt stored credentials',
          credentials: null
        });
      }
    }

    if (method === 'PUT') {
      const { apiKey, username, maxIntensity, maxDuration, selectedShockerId, selectedSharecode } = await request.json();

      if (!apiKey || !username) {
        return jsonResponse({ 
          success: false, 
          error: 'Missing required fields: apiKey and username are required' 
        }, 400);
      }

      // Validate user-provided limits
      const finalMaxIntensity = Math.min(Math.max(parseInt(maxIntensity as string) || 100, 1), 100);
      const finalMaxDuration = Math.min(Math.max(parseInt(maxDuration as string) || 15, 1), 15);

      console.log('SETTINGS: Starting PiShock credential validation');
      console.log('SETTINGS: Username:', username);
      console.log('SETTINGS: User limits - Max Intensity:', finalMaxIntensity, 'Max Duration:', finalMaxDuration);
      console.log('SETTINGS: Selected Shocker ID:', selectedShockerId);
      console.log('SETTINGS: Selected Sharecode:', selectedSharecode);

      // Step 1: Validate credentials
      const credentialValidation = await validatePiShockCredentials(apiKey, username);
      
      if (!credentialValidation.valid) {
        console.log('SETTINGS: Credential validation failed:', credentialValidation.error);
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
      console.log('SETTINGS: ✓ Credential validation successful, PiShock User ID:', piShockUserId);

      // Step 2: Check if user has devices
      const deviceCheck = await getUserDevices(apiKey, username);
      console.log('SETTINGS: Device check result:', deviceCheck);
      
      const hasDevices = deviceCheck.hasDevices;
      const deviceCount = deviceCheck.devices?.length || 0;
      const availableShockers = deviceCheck.availableShockers || [];

      // Step 3: Get available sharecodes
      const sharecodesCheck = await getDeviceSharecodes(apiKey, username);
      console.log('SETTINGS: Sharecodes check result:', sharecodesCheck);
      
      const availableSharecodes = sharecodesCheck.success ? sharecodesCheck.sharecodes || [] : [];

      // Validate selected sharecode if provided
      let validatedSharecode = null;
      if (selectedSharecode) {
        const isValidSharecode = availableSharecodes.some((sc: any) => 
          sc.code === selectedSharecode || sc.shareCode === selectedSharecode
        );
        if (isValidSharecode) {
          validatedSharecode = selectedSharecode;
          console.log('SETTINGS: ✓ Selected sharecode validated:', validatedSharecode);
        } else {
          console.warn('SETTINGS: Selected sharecode not found in available sharecodes');
        }
      }

      // Validate selected shocker if provided
      let validatedShockerId = null;
      if (selectedShockerId) {
        const isValidShocker = availableShockers.some((shocker: any) => 
          shocker.shockerId.toString() === selectedShockerId.toString()
        );
        if (isValidShocker) {
          validatedShockerId = selectedShockerId.toString();
          console.log('SETTINGS: ✓ Selected shocker validated:', validatedShockerId);
        } else {
          console.warn('SETTINGS: Selected shocker not found in available shockers, using automatic selection');
        }
      }

      // If no valid selected shocker, use the first available one
      if (!validatedShockerId && availableShockers.length > 0) {
        validatedShockerId = availableShockers[0].shockerId.toString();
        console.log('SETTINGS: ✓ Auto-selected first available shocker:', validatedShockerId);
      }

      // Store credentials with all settings
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

      // Store all user data in a single key
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

      console.log('SETTINGS: ✓ Settings saved successfully for user:', userId);
      
      // Clear the user's status cache
      try {
        const statusCacheKey = `cache:user_status:${userId}`;
        await env.PISHOCK_KV.delete(statusCacheKey);
        console.log('SETTINGS: ✓ Cleared status cache for user:', userId);
      } catch (error) {
        console.warn('SETTINGS: Failed to clear status cache:', error);
      }

      return jsonResponse({ 
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
      // Delete all user data
      await env.PISHOCK_KV.delete(`user:${userId}:data`);
      
      // Clear cache
      try {
        const statusCacheKey = `cache:user_status:${userId}`;
        await env.PISHOCK_KV.delete(statusCacheKey);
      } catch (error) {
        console.warn('SETTINGS: Failed to clear status cache:', error);
      }
      
      return jsonResponse({ success: true });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('SETTINGS: API error:', error);
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