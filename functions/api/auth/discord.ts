import { v4 as uuidv4 } from 'uuid';

import { validateDiscordToken } from '../../lib/discord-auth';

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

    // Check instance status before allowing authentication
    try {
      const instanceStatusData = await env.PISHOCK_KV.get(`instance:${instanceId}:status`);
      if (instanceStatusData) {
        const instanceStatus = JSON.parse(instanceStatusData);
        if (instanceStatus.status === 'inactive') {
          console.log(`Authentication blocked for inactive instance: ${instanceId}`);
          return jsonResponse({ 
            error: 'This Discord Activity session has ended. Please start a new session.',
            instanceExpired: true
          }, 403);
        }
      }
    } catch (error) {
      console.warn('Failed to check instance status:', error);
      // Continue with authentication if status check fails
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

    // Store tokens in KV with proper TTL and structured data
    const expiresAt = Date.now() + (expires_in * 1000) - 60000; // 1 minute early for safety
    const tokenData = {
      access_token,
      expires_at: expiresAt,
      user_id: user.id,
      username: user.username,
      global_name: user.global_name,
      avatar: user.avatar
    };

    await Promise.all([
      // Store structured token data instead of just the token
      env.PISHOCK_KV.put(`discord_token:${user.id}`, JSON.stringify(tokenData), { 
        expirationTtl: expires_in - 60 // Expire 1 minute early for safety
      }),
      env.PISHOCK_KV.put(`discord_auth:refresh_token:${user.id}`, refresh_token),
      // Mark instance as active when user successfully authenticates
      env.PISHOCK_KV.put(`instance:${instanceId}:status`, JSON.stringify({
        status: 'active',
        last_activity: new Date().toISOString(),
        participant_count: 1, // This will be updated when participants are fetched
        created_at: new Date().toISOString(),
        last_authenticated_user: user.id
      }), { expirationTtl: 21600 }) // 6 hours
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