import { v4 as uuidv4 } from 'uuid';

interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI?: string;
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

    // Exchange code for token
    const params = new URLSearchParams();
    params.append('client_id', env.DISCORD_CLIENT_ID);
    params.append('client_secret', env.DISCORD_CLIENT_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    
    // Discord Activities don't typically need a redirect URI
    // but we'll include it if it's configured in the environment
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
      console.error('Discord token exchange failed:', error);
      return jsonResponse({ error: 'Failed to exchange code' }, 500);
    }

    const tokenData = await discordRes.json();
    const { access_token, refresh_token, expires_in, token_type } = tokenData;

    // Get user info
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `${token_type} ${access_token}` },
    });

    if (!userRes.ok) {
      return jsonResponse({ error: 'Failed to fetch user' }, 500);
    }

    const user = await userRes.json();

    // Store tokens and user in KV with proper TTL
    await Promise.all([
      env.PISHOCK_KV.put(`discord_auth:access_token:${instanceId}:${user.id}`, access_token, { 
        expirationTtl: expires_in - 60 // Expire 1 minute early for safety
      }),
      env.PISHOCK_KV.put(`discord_auth:refresh_token:${user.id}`, refresh_token),
      env.PISHOCK_KV.put(`discord_user:${user.id}`, JSON.stringify(user), {
        expirationTtl: 3600 // 1 hour
      }),
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