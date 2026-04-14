import { operatePiShockShocker, resolvePiShockShockerId } from '../../_shared/pishock-client';

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
    
    // Try to get expiry info from metadata
    let expiresAt = 0;
    let cacheTtl = 10800; // Default 3 hours if no metadata
    const metadataStr = await kv.get(`discord_token_metadata:${userData.id}`);
    if (metadataStr) {
      const metadata = JSON.parse(metadataStr);
      expiresAt = metadata.expires_at;
      // Use remaining token lifetime for cache TTL
      const now = Math.floor(Date.now() / 1000);
      const remainingTime = expiresAt - now;
      cacheTtl = Math.max(60, remainingTime - 60); // At least 1 minute
    }
    
    await kv.put(cacheKey, JSON.stringify({
      ...userData,
      token_expires_at: expiresAt
    }), {
      expirationTtl: cacheTtl // Match token expiry
    });
    
    return userData;
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

async function testPiShockConnection(apiKey: string, username: string, sharecode: string, shockerId?: string): Promise<{ ok: boolean; shockerId?: string }> {
  const credentials = { apiKey, username, shockerId };
  const shockerResult = await resolvePiShockShockerId(credentials, sharecode);
  if (!shockerResult.ok || !shockerResult.data) {
    return { ok: false };
  }

  const operateResult = await operatePiShockShocker(credentials, shockerResult.data, {
    operation: 2,
    intensity: 1,
    durationSeconds: 1,
    agentName: 'DiscordActivityConnectionTest',
  });

  if (!operateResult.ok) {
    return { ok: false };
  }

  return { ok: true, shockerId: shockerResult.data };
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

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    const encrypted = await env.PISHOCK_KV.get(`instance:${instanceId}:pishock`);
    if (!encrypted) {
      return jsonResponse({ 
        success: false, 
        isConnected: false, 
        error: 'No credentials stored for this instance' 
      });
    }

    try {
      const creds = await decrypt(encrypted);
      const connectionResult = await testPiShockConnection(creds.apiKey, creds.username, creds.sharecode, creds.shockerId);
      const isConnected = connectionResult.ok;
      const lastTested = new Date().toISOString();
      
      if (connectionResult.shockerId && connectionResult.shockerId !== creds.shockerId) {
        creds.shockerId = connectionResult.shockerId;
        await env.PISHOCK_KV.put(`instance:${instanceId}:pishock`, btoa(JSON.stringify(creds)), { expirationTtl: 21600 });
      }
      await env.PISHOCK_KV.put(`instance:${instanceId}:pishock:lastTested`, lastTested, { expirationTtl: 21600 });
      
      return jsonResponse({ 
        success: isConnected, 
        isConnected, 
        lastTested 
      });
    } catch (error) {
      return jsonResponse({ 
        success: false, 
        isConnected: false, 
        error: 'Failed to test connection' 
      });
    }
  } catch (error) {
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};