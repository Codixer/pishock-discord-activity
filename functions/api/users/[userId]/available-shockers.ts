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

async function getUserDevicesShockers(apiKey: string, username: string): Promise<{ success: boolean; shockers?: any[]; error?: string }> {
  try {
    console.log('=== Getting user shockers for selection ===');
    console.log('Username:', username);
    console.log('API Key length:', apiKey.length);
    
    // First, get the actual user ID using the auth endpoint
    const authUrl = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    console.log('Getting user ID from auth endpoint');
    
    const authResponse = await fetch(authUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/2.0',
        'Accept': 'application/json'
      }
    });
    
    if (!authResponse.ok) {
      console.log('Auth response not OK:', authResponse.status);
      return { 
        success: false, 
        error: `Failed to authenticate: HTTP ${authResponse.status}`
      };
    }
    
    const authData = await authResponse.json();
    console.log('Auth response data:', authData);
    
    if (!authData || !authData.id) {
      return { 
        success: false, 
        error: 'Invalid credentials - could not get user ID'
      };
    }
    
    const userId = authData.id;
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
        success: false, 
        error: `Failed to get devices: HTTP ${response.status}`
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
        success: false, 
        error: 'Invalid devices response format'
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
              shockerName: shocker.name || `Shocker ${shocker.shockerId}`, // Fixed: use 'name' property
              deviceId: device.clientId,
              deviceName: device.name || `Device ${device.clientId}`,
              displayName: `${shocker.name || `Shocker ${shocker.shockerId}`} (${device.name || `Device ${device.clientId}`})` // Fixed: use 'name' property
            });
          });
        }
      });
    }
    
    console.log('Found', availableShockers.length, 'available shockers');
    
    return { 
      success: true, 
      shockers: availableShockers
    };
    
  } catch (error) {
    console.error('Failed to get user shockers:', error);
    return { 
      success: false, 
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
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
    console.log('No authorization token provided');
    return jsonResponse({ 
      success: false, 
      error: 'Authorization required' 
    }, 401);
  }

  const user = await validateDiscordToken(token);
  if (!user) {
    console.log('Invalid Discord token');
    return jsonResponse({ 
      success: false, 
      error: 'Invalid authorization token' 
    }, 401);
  }
  // Users can only get their own available shockers
  if (user.id !== userId) {
    console.log(`User ${user.id} tried to access shockers for user ${userId}`);
    return jsonResponse({ 
      success: false, 
      error: 'You can only access your own shockers' 
    }, 403);
  }
  try {
    const { apiKey, username } = await request.json();
    
    console.log('=== Available shockers endpoint called ===');
    console.log('User ID:', userId);
    console.log('API Key provided:', !!apiKey);
    console.log('Username provided:', !!username);

    if (!apiKey || !username) {
      console.log('Missing required fields');
      return jsonResponse({ 
        success: false, 
        error: 'Missing required fields: apiKey and username are required' 
      }, 400);
    }

    console.log('Getting available shockers for user:', userId);
    const result = await getUserDevicesShockers(apiKey, username);
    
    console.log('Result from getUserDevicesShockers:', result);
    
    if (!result.success) {
      console.log('Failed to get shockers:', result.error);
      return jsonResponse({ 
        success: false, 
        error: result.error || 'Failed to get available shockers'
      });
    }

    console.log('Returning successful response with', result.shockers?.length || 0, 'shockers');
    return jsonResponse({ 
      success: true, 
      shockers: result.shockers || []
    });

  } catch (error) {
    console.error('Available shockers error:', error);
    return jsonResponse({ 
      success: false,
      error: 'Internal server error'
    }, 500);
  }
};
