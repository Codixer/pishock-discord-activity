interface Env {
  PISHOCK_KV: KVNamespace;
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

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60', // 5 minutes cache
    },
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const method = request.method;
  const guildId = params.guildId as string;
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

  if (method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    const cacheKey = `discord_guild_member:${guildId}:${userId}`;
    
    let memberData = await env.PISHOCK_KV.get(cacheKey);
    if (!memberData) {
      try {
        const response = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          return jsonResponse({ error: 'Failed to fetch guild member' }, response.status);
        }

        memberData = await response.text();
        await env.PISHOCK_KV.put(cacheKey, memberData, { expirationTtl: 600 });
      } catch (error) {
        console.error('Failed to fetch guild member:', error);
        return jsonResponse({ error: 'Failed to fetch guild member' }, 500);
      }
    }

    return new Response(memberData, { 
      status: 200, 
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      } 
    });
  } catch (error) {
    console.error('Guild member error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};