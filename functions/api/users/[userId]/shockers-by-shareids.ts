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

async function getShockersByShareIds(apiKey: string, username: string, shareIds: string[]): Promise<{ success: boolean; shockers?: any; error?: string; debugInfo?: any }> {
  try {
    console.log('Getting shockers by share IDs...', shareIds);
    
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
    console.log('Getting shockers for user ID:', userId, 'with share IDs:', shareIds);
    
    // Build URL with multiple shareIds parameters
    const baseUrl = `https://ps.pishock.com/PiShock/GetShockersByShareIds?UserId=${userId}&Token=${encodeURIComponent(apiKey)}&api=true`;
    const shareIdParams = shareIds.map(id => `shareIds=${encodeURIComponent(id)}`).join('&');
    const url = `${baseUrl}&${shareIdParams}`;
    
    console.log('Making shockers request to:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/2.0',
        'Accept': 'application/json'
      }
    });
    
    console.log('Shockers response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Shockers error response:', errorText);
      return { 
        success: false, 
        error: `Shockers fetch failed: HTTP ${response.status}`,
        debugInfo: { status: response.status, error: errorText }
      };
    }
    
    const responseText = await response.text();
    console.log('Shockers raw response:', responseText.substring(0, 500));
    
    let shockersData;
    try {
      shockersData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse shockers response:', parseError);
      return { 
        success: false, 
        error: 'Invalid shockers response format',
        debugInfo: { parseError: parseError instanceof Error ? parseError.message : 'Unknown parse error' }
      };
    }

    console.log('Parsed shockers data:', shockersData);
    
    if (!shockersData || typeof shockersData !== 'object') {
      console.log('No shockers found in response');
      return { 
        success: true, 
        shockers: {},
        debugInfo: { 
          shockersCount: 0,
          userId,
          shareIds,
          responseFormat: typeof shockersData 
        }
      };
    }
    
    console.log('✓ Found shockers data for', Object.keys(shockersData).length, 'users');
    
    return {
      success: true,
      shockers: shockersData,
      debugInfo: { 
        userCount: Object.keys(shockersData).length,
        userId,
        shareIds,
        responseFormat: typeof shockersData
      }
    };
    
  } catch (error) {
    console.error('Failed to get shockers by share IDs:', error);
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

  // Users can only access their own shockers info
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
          shockers: {}
        });
      }

      const settings = JSON.parse(storedSettings);
      if (!settings.apiKey || !settings.username) {
        return jsonResponse({
          success: false,
          error: 'Invalid PiShock settings. Please reconfigure your settings.',
          shockers: {}
        });
      }

      // Get shareIds from query parameter - can be multiple
      const url = new URL(request.url);
      const shareIds = url.searchParams.getAll('shareIds');

      if (shareIds.length === 0) {
        return jsonResponse({
          success: false,
          error: 'No share IDs provided. Please provide at least one shareIds parameter.',
          shockers: {}
        });
      }

      const shockersResult = await getShockersByShareIds(settings.apiKey, settings.username, shareIds);
      
      if (shockersResult.success) {
        return jsonResponse({
          success: true,
          shockers: shockersResult.shockers || {},
          shareIds: shareIds,
          debugInfo: shockersResult.debugInfo
        });
      } else {
        return jsonResponse({
          success: false,
          error: shockersResult.error || 'Failed to fetch shockers',
          shockers: {},
          debugInfo: shockersResult.debugInfo
        });
      }
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('Shockers by share IDs API error:', error);
    return jsonResponse({
      success: false,
      error: 'Internal server error',
      shockers: {}
    }, 500);
  }
};
