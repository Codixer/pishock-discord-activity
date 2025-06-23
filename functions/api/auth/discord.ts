interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_SECRET: string;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  try {
    const { code, instanceId } = await request.json();

    if (!code || !instanceId) {
      return jsonResponse({ error: 'Missing code or instanceId' }, 400);
    }

    // Exchange code for Discord access token
    const discordClientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
    
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: discordClientId,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Discord token exchange failed:', error);
      return jsonResponse({ error: 'Failed to exchange Discord code' }, 500);
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Get user info from Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });

    if (!userResponse.ok) {
      return jsonResponse({ error: 'Failed to fetch Discord user info' }, 500);
    }

    const user = await userResponse.json();

    // Store tokens in KV with expiration
    const tokenKey = `discord_token:${instanceId}:${user.id}`;
    const userKey = `discord_user:${user.id}`;

    await Promise.all([
      env.PISHOCK_KV.put(tokenKey, access_token, { 
        expirationTtl: expires_in - 60 // Expire 1 minute early
      }),
      env.PISHOCK_KV.put(userKey, JSON.stringify({
        ...user,
        refreshToken: refresh_token,
        lastSeen: new Date().toISOString(),
      }), {
        expirationTtl: 86400 // 24 hours
      }),
    ]);

    return jsonResponse({
      access_token,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.global_name || user.username,
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256` : null,
      },
    });
  } catch (error) {
    console.error('Discord auth error:', error);
    return jsonResponse({ 
      error: 'Authentication failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
};