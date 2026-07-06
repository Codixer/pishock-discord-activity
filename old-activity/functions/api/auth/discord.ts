import { v4 as uuidv4 } from 'uuid';

// Type declarations for Cloudflare Workers
declare global {
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }
}

interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI?: string;
}

interface PagesFunction<Env = unknown> {
  (context: { request: Request; env: Env; params: Record<string, string>; waitUntil: (promise: Promise<any>) => void; passThroughOnException: () => void; }): Promise<Response> | Response;
}

function jsonResponse(body: any, status = 200, additionalHeaders: Record<string, string> = {}) {
  const headers = { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...additionalHeaders
  };
  
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const method = request.method;

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

  try {
    const { code, instanceId } = await request.json();

    if (!code || !instanceId) {
      return jsonResponse({ error: 'Missing code or instanceId' }, 400);
    }

    // Check instance status before allowing authentication
    try {
      const instanceStatusData = await env.PISHOCK_KV.get(`instance:${instanceId}:status`);
      if (instanceStatusData) {
        const instanceStatus = JSON.parse(instanceStatusData);
        if (instanceStatus.status === 'inactive') {
          return jsonResponse({ 
            error: 'This Discord Activity session has ended. Please start a new session.',
            instanceExpired: true
          }, 403);
        }
      }
    } catch (error) {
      // Continue with authentication if status check fails
    }

    const params = new URLSearchParams();
    params.append('client_id', env.DISCORD_CLIENT_ID);
    params.append('client_secret', env.DISCORD_CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    
    if (env.DISCORD_REDIRECT_URI) {
      params.append('redirect_uri', env.DISCORD_REDIRECT_URI);
    }

    const discordRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!discordRes.ok) {
      const error = await discordRes.text();
      return jsonResponse({ error: 'Failed to exchange code' }, 500);
    }

    const tokenData = await discordRes.json();
    const { access_token, refresh_token, expires_in, token_type } = tokenData;

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `${token_type} ${access_token}` },
    });

    if (!userRes.ok) {
      return jsonResponse({ error: 'Failed to fetch user' }, 500);
    }

    const user = await userRes.json();

    // Calculate token expiration timestamp
    const expiresAt = Math.floor(Date.now() / 1000) + expires_in;

    await Promise.all([
      // Store complete token metadata including refresh_token
      env.PISHOCK_KV.put(`discord_token_metadata:${user.id}`, JSON.stringify({
        access_token,
        refresh_token,
        expires_at: expiresAt,
        expires_in,
        token_type,
        user_id: user.id,
        created_at: Math.floor(Date.now() / 1000)
      }), { 
        expirationTtl: expires_in + 86400 // Token lifetime + 1 day buffer
      }),
      
      // Keep legacy token storage for backward compatibility (will phase out)
      env.PISHOCK_KV.put(`discord_token:${user.id}`, access_token, { 
        expirationTtl: expires_in - 60
      }),
      
      // Store user profile info
      env.PISHOCK_KV.put(`discord_user:${user.id}`, JSON.stringify(user), {
        expirationTtl: 604800 // 7 days - reduced KV writes
      }),
      
      // Validation cache - match token expiry instead of capping at 3h
      env.PISHOCK_KV.put(`discord_token_validation:${access_token.slice(-8)}`, JSON.stringify({
        ...user,
        token_expires_at: expiresAt // Add expiry info to cached data
      }), {
        expirationTtl: expires_in - 60 // Match actual token lifetime (usually 7 days)
      }),
      
      // Instance status
      env.PISHOCK_KV.put(`instance:${instanceId}:status`, JSON.stringify({
        status: 'active',
        last_activity: new Date().toISOString(),
        participant_count: 1,
        created_at: new Date().toISOString(),
        last_authenticated_user: user.id
      }), { expirationTtl: 21600 })
    ]);

    return jsonResponse({ access_token, user });
  } catch (error) {
    console.error('Discord auth error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};