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

async function testPiShockConnection(apiKey: string, username: string, sharecode: string): Promise<boolean> {
  try {
    const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username,
        apikey: apiKey,
        code: sharecode,
        intensity: 1,
        duration: 1,
        op: 2, // 2 = beep (least intrusive test)
        name: 'DiscordActivityConnectionTest',
      }),
    });
    
    if (!response.ok) {
      return false;
    }
    
    const responseText = await response.text();
    return responseText.includes('Operation Succeeded') || response.status === 200;
  } catch (error) {
    return false;
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const method = request.method;
  const instanceId = params.instanceId as string;

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

  try {
    if (method === 'PUT') {
      const { apiKey, username, sharecode } = await request.json();

      if (!apiKey || !username || !sharecode) {
        return jsonResponse({ 
          success: false, 
          error: 'Missing required fields: apiKey, username, sharecode' 
        }, 400);
      }

      const isConnected = await testPiShockConnection(apiKey, username, sharecode);
      
      if (!isConnected) {
        return jsonResponse({ 
          success: false, 
          isConnected: false, 
          error: 'Failed to connect to PiShock device. Please check your credentials.' 
        });
      }

      const encrypted = await encrypt({ apiKey, username, sharecode });
      await Promise.all([
        env.PISHOCK_KV.put(`instance:${instanceId}:pishock`, encrypted, { expirationTtl: 21600 }),
        env.PISHOCK_KV.put(`instance:${instanceId}:pishock:lastTested`, new Date().toISOString(), { expirationTtl: 21600 }),
        env.PISHOCK_KV.put(`instance:${instanceId}:pishock:configuredBy`, user.id, { expirationTtl: 21600 })
      ]);

      return jsonResponse({ success: true, isConnected: true });
    }

    if (method === 'DELETE') {
      await Promise.all([
        env.PISHOCK_KV.delete(`instance:${instanceId}:pishock`),
        env.PISHOCK_KV.delete(`instance:${instanceId}:pishock:lastTested`),
        env.PISHOCK_KV.delete(`instance:${instanceId}:pishock:configuredBy`)
      ]);
      return jsonResponse({ success: true });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('PiShock settings error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};