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
    console.log('TOKEN_VALIDATION: Validating Discord token');
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      console.log('TOKEN_VALIDATION: Token validation failed:', response.status);
      throw new Error('Invalid Discord token');
    }
    
    const userData = await response.json();
    console.log('TOKEN_VALIDATION: ✓ Token validation successful for user:', userData.id);
    
    // Cache user data using stable user ID (not token-based)
    await kv.put(`discord_user:${userData.id}`, JSON.stringify(userData), {
      expirationTtl: 86400 // 24 hours
    });
    
    console.log('TOKEN_VALIDATION: ✓ Cached user data for:', userData.id);
    return userData;
  } catch (error) {
    console.error('TOKEN_VALIDATION: Error validating token:', error);
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

async function testPiShockConnection(apiKey: string, username: string, sharecode: string): Promise<boolean> {
  try {
    // Use V3 API Operate endpoint with minimal test command (1% beep for 1 second)
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
        name: 'DiscordActivityStatusTest',
      }),
    });
    
    if (!response.ok) {
      return false;
    }
    
    const responseText = await response.text();
    // Check for success response from V3 API
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

  if (method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    const encrypted = await env.PISHOCK_KV.get(`instance:${instanceId}:pishock`);
    const lastTested = await env.PISHOCK_KV.get(`instance:${instanceId}:pishock:lastTested`);
    
    let isConnected = false;
    if (encrypted) {
      try {
        const creds = await decrypt(encrypted);
        isConnected = await testPiShockConnection(creds.apiKey, creds.username, creds.sharecode);
        
        // Update last tested timestamp
        if (isConnected) {
          await env.PISHOCK_KV.put(`instance:${instanceId}:pishock:lastTested`, new Date().toISOString(), { expirationTtl: 21600 }); // 6 hours
        }
      } catch (error) {
        console.error('Failed to test stored credentials:', error);
        isConnected = false;
      }
    }

    return jsonResponse({ 
      hasCredentials: !!encrypted, 
      isConnected, 
      lastTested 
    });
  } catch (error) {
    console.error('PiShock status error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};