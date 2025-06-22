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
      };
    }

    console.log('Parsed sharecodes data:', sharecodesData);
    
    // Handle the API response format - it returns an object with arrays as values
    let allSharecodes: any[] = [];
    if (typeof sharecodesData === 'object' && sharecodesData !== null) {
      // Extract arrays from the object values
      Object.values(sharecodesData).forEach((value: any) => {
        if (Array.isArray(value)) {
          allSharecodes = allSharecodes.concat(value);
        }
      });
    } else if (Array.isArray(sharecodesData)) {
      // Fallback to direct array format
      allSharecodes = sharecodesData;
    }

    if (allSharecodes.length === 0) {
      console.log('No sharecodes found in response');
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
    
    // Filter by device ID if provided
    let filteredSharecodes = allSharecodes;
    if (deviceId) {
      filteredSharecodes = allSharecodes.filter(sharecode => {
        // Check various possible property names for device ID
        const shockerId = sharecode.shockerId || sharecode.ShockerId || sharecode.deviceId || sharecode.DeviceId;
        return shockerId && shockerId.toString() === deviceId.toString();
      });
      console.log(`Filtered sharecodes for device ${deviceId}:`, filteredSharecodes.length, 'found');
    }
    
    console.log('✓ Found', filteredSharecodes.length, 'sharecodes', deviceId ? `for device ${deviceId}` : 'total');
    
    return {
      success: true,
      sharecodes: filteredSharecodes,
      debugInfo: { 
        sharecodesCount: filteredSharecodes.length,
        totalSharecodes: allSharecodes.length,
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

  // Users can only access their own device sharecodes
  if (user.id !== userId) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    if (method === 'GET') {
      // Get user's stored PiShock credentials
      const settingsKey = `pishock_settings_${userId}`;
      const storedSettings = await env.PISHOCK_KV.get(settingsKey);

      if (!storedSettings) {
        return jsonResponse({
          success: false,
          error: 'No PiShock settings found. Please configure your settings first.',
          sharecodes: []
        });
      }

      const settings = JSON.parse(storedSettings);
      if (!settings.apiKey || !settings.username) {
        return jsonResponse({
          success: false,
          error: 'Invalid PiShock settings. Please reconfigure your settings.',
          sharecodes: []
        });
      }

      // Get deviceId from query parameter if provided
      const url = new URL(request.url);
      const deviceId = url.searchParams.get('deviceId');

      const sharecodesResult = await getDeviceSharecodes(settings.apiKey, settings.username, deviceId || undefined);
      
      if (sharecodesResult.success) {
        return jsonResponse({
          success: true,
          sharecodes: sharecodesResult.sharecodes || [],
          deviceId: deviceId,
          debugInfo: sharecodesResult.debugInfo
        });
      } else {
        return jsonResponse({
          success: false,
          error: sharecodesResult.error || 'Failed to fetch sharecodes',
          sharecodes: [],
          debugInfo: sharecodesResult.debugInfo
        });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('Device sharecodes API error:', error);
    return jsonResponse({
      success: false,
      error: 'Internal server error',
      sharecodes: []
    }, 500);
  }
};
