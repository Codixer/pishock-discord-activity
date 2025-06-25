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
        // Cache for 10 minutes
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