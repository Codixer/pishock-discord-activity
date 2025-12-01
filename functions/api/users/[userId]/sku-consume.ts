interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
}

interface PagesFunction<Env = unknown> {
  (context: { request: Request; env: Env; params: Record<string, string>; waitUntil: (promise: Promise<any>) => void; passThroughOnException: () => void; }): Promise<Response> | Response;
}

// SKU IDs
const SHOCK_PAST_LIMIT_SKU_ID = "1418562984946569267";

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
    const cacheKey = `discord_token_validation:${token.slice(-8)}`;
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
    
    let expiresAt = 0;
    let cacheTtl = 10800;
    const metadataStr = await kv.get(`discord_token_metadata:${userData.id}`);
    if (metadataStr) {
      const metadata = JSON.parse(metadataStr);
      expiresAt = metadata.expires_at;
      const now = Math.floor(Date.now() / 1000);
      const remainingTime = expiresAt - now;
      cacheTtl = Math.max(60, remainingTime - 60);
    }
    
    await kv.put(cacheKey, JSON.stringify({
      ...userData,
      token_expires_at: expiresAt
    }), {
      expirationTtl: cacheTtl
    });
    
    return userData;
  } catch (error) {
    return null;
  }
}

async function fetchUserEntitlements(token: string, userId: string): Promise<any> {
  try {
    const response = await fetch('https://discord.com/api/v9/applications/@me/entitlements', {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    const entitlements = await response.json();
    return entitlements;
  } catch (error) {
    return null;
  }
}

async function consumeEntitlement(token: string, entitlementId: string): Promise<boolean> {
  try {
    const response = await fetch(`https://discord.com/api/v9/applications/@me/entitlements/${entitlementId}/consume`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    
    return response.ok;
  } catch (error) {
    return false;
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const method = request.method;
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

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });

  // Verify the user is consuming their own SKU
  if (user.id !== userId) {
    return jsonResponse({ 
      success: false,
      error: 'Unauthorized to consume this user\'s SKU' 
    }, 403);
  }

  try {
    const { skuId } = await request.json();

    if (!skuId || skuId !== SHOCK_PAST_LIMIT_SKU_ID) {
      return jsonResponse({ 
        success: false,
        error: 'Invalid SKU ID' 
      }, 400);
    }

    // Fetch user entitlements to find the entitlement to consume
    const entitlements = await fetchUserEntitlements(token, userId);
    
    if (!entitlements || !Array.isArray(entitlements)) {
      return jsonResponse({ 
        success: false,
        error: 'Failed to fetch entitlements' 
      }, 500);
    }

    // Find an unconsumed entitlement for this SKU
    // Check by SKU ID and consumed status, not type (type can be 3 or 4)
    const entitlement = entitlements.find((ent: any) => 
      ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && 
      !ent.consumed
    );

    if (!entitlement) {
      return jsonResponse({ 
        success: false,
        error: 'No available consumable entitlement found' 
      }, 404);
    }

    // Consume the entitlement
    const consumed = await consumeEntitlement(token, entitlement.id);
    
    if (!consumed) {
      return jsonResponse({ 
        success: false,
        error: 'Failed to consume entitlement' 
      }, 500);
    }

    // Invalidate SKU status cache
    try {
      await env.PISHOCK_KV.delete(`cache:sku_status:${userId}`);
    } catch (error) {
      // Silently handle cache invalidation errors
    }

    return jsonResponse({ 
      success: true,
      message: 'SKU consumed successfully',
      entitlementId: entitlement.id
    });

  } catch (error) {
    return jsonResponse({ 
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};

