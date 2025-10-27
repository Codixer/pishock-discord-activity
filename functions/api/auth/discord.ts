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

    // Only store the access token - no caching
    await env.PISHOCK_KV.put(`discord_token:${user.id}`, access_token, { 
      expirationTtl: expires_in - 60
    });

    return jsonResponse({ access_token, user });
  } catch (error) {
    console.error('Discord auth error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};