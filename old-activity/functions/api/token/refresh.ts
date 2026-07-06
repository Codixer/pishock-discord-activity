// Manual token refresh endpoint
// Allows frontend to manually trigger token refresh

interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
}

interface PagesFunction<Env = unknown> {
  (context: { request: Request; env: Env; params: Record<string, string>; waitUntil: (promise: Promise<any>) => void; passThroughOnException: () => void; }): Promise<Response> | Response;
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

async function requireAuth(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

async function refreshDiscordToken(
  userId: string,
  kv: KVNamespace,
  env: Env
): Promise<{ success: boolean; access_token?: string; expires_at?: number; error?: string }> {
  try {
    const metadataStr = await kv.get(`discord_token_metadata:${userId}`);
    if (!metadataStr) {
      return { success: false, error: 'No token metadata found' };
    }

    const metadata = JSON.parse(metadataStr);
    if (!metadata.refresh_token) {
      return { success: false, error: 'No refresh token available' };
    }

    console.log(`[Token Refresh] Refreshing token for user ${userId}`);

    const params = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: metadata.refresh_token
    });

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Token Refresh] Failed for user ${userId}:`, errorText);
      return { success: false, error: 'Token refresh failed with Discord' };
    }

    const newTokenData = await response.json();
    const { access_token, refresh_token, expires_in } = newTokenData;
    const expiresAt = Math.floor(Date.now() / 1000) + expires_in;

    // Update all token storage
    await Promise.all([
      kv.put(`discord_token_metadata:${userId}`, JSON.stringify({
        access_token,
        refresh_token: refresh_token || metadata.refresh_token,
        expires_at: expiresAt,
        expires_in,
        token_type: 'Bearer',
        user_id: userId,
        created_at: Math.floor(Date.now() / 1000)
      }), { expirationTtl: expires_in + 86400 }),
      
      kv.put(`discord_token:${userId}`, access_token, { 
        expirationTtl: expires_in - 60 
      }),
      
      kv.put(`discord_token_validation:${access_token.slice(-8)}`, JSON.stringify({
        id: userId,
        token_expires_at: expiresAt
      }), {
        expirationTtl: expires_in - 60 // Match token expiry
      })
    ]);

    console.log(`[Token Refresh] Success for user ${userId}, new token expires at ${new Date(expiresAt * 1000).toISOString()}`);
    
    return {
      success: true,
      access_token,
      expires_at: expiresAt,
    };
  } catch (error) {
    console.error(`[Token Refresh] Error for user ${userId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const method = request.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const token = await requireAuth(request);
    if (!token) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Get user ID from current token
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401);
    }

    const user = await response.json();

    // Attempt to refresh the token
    const result = await refreshDiscordToken(user.id, env.PISHOCK_KV, env);

    if (result.success) {
      return jsonResponse({
        success: true,
        access_token: result.access_token,
        expires_at: result.expires_at,
        message: 'Token refreshed successfully'
      });
    } else {
      return jsonResponse({
        success: false,
        error: result.error || 'Token refresh failed'
      }, 400);
    }
  } catch (error) {
    console.error('[Token Refresh Endpoint] Error:', error);
    return jsonResponse({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};
