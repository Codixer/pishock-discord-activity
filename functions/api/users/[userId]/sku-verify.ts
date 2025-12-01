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
const CONTROLLER_PLUS_SKU_ID = "1387037988558606457";

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

async function getCachedSkuStatus(kv: KVNamespace, userId: string) {
  try {
    const cacheKey = `cache:sku_status:${userId}`;
    const cached = await kv.get(cacheKey);
    if (cached) {
      const cachedData = JSON.parse(cached);
      const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
      if (cacheAge < 300000) { // 5 minute cache
        return cachedData.status;
      }
    }
  } catch (error) {
    // Silently handle cache errors
  }
  return null;
}

async function setCachedSkuStatus(kv: KVNamespace, userId: string, status: any) {
  try {
    const cacheKey = `cache:sku_status:${userId}`;
    const cacheData = {
      status,
      timestamp: new Date().toISOString()
    };
    
    await kv.put(cacheKey, JSON.stringify(cacheData), {
      expirationTtl: 300 // 5 minutes
    });
  } catch (error) {
    // Silently handle cache errors
  }
}

async function fetchUserEntitlements(token: string, userId: string): Promise<any> {
  try {
    // Fetch entitlements from Discord API
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

  if (method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });

  // Verify the user is requesting their own SKU status or has permission
  if (user.id !== userId) {
    return jsonResponse({ 
      error: 'Unauthorized to access this user\'s SKU status' 
    }, 403);
  }

  try {
    // Check cache first
    const cachedStatus = await getCachedSkuStatus(env.PISHOCK_KV, userId);
    if (cachedStatus) {
      return jsonResponse(cachedStatus, 200, {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        'X-Cache-Status': 'HIT'
      });
    }

    // Fetch entitlements from Discord
    const entitlements = await fetchUserEntitlements(token, userId);
    
    let hasShockPastLimit = false;
    let hasControllerPlus = false;
    let subscriptionExpiresAt: number | undefined;

    if (entitlements && Array.isArray(entitlements)) {
      for (const entitlement of entitlements) {
        // Check for consumable SKU (Shock Past Limit)
        if (entitlement.sku_id === SHOCK_PAST_LIMIT_SKU_ID) {
          // For consumables, check if it's not consumed
          if (entitlement.type === 3 && !entitlement.consumed) {
            hasShockPastLimit = true;
          }
        }
        
        // Check for subscription SKU (Controller+)
        if (entitlement.sku_id === CONTROLLER_PLUS_SKU_ID) {
          if (entitlement.type === 5) { // Subscription type
            // Check if subscription is active
            if (entitlement.ends_at) {
              const expiresAt = new Date(entitlement.ends_at).getTime() / 1000;
              const now = Math.floor(Date.now() / 1000);
              if (expiresAt > now) {
                hasControllerPlus = true;
                subscriptionExpiresAt = expiresAt;
              }
            } else {
              // No expiration means active subscription
              hasControllerPlus = true;
            }
          }
        }
      }
    }

    // Also check user settings for consent flags
    const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
    const userData = userDataStr ? JSON.parse(userDataStr) : null;
    
    const result = {
      hasShockPastLimit,
      hasControllerPlus,
      subscriptionExpiresAt,
      allowShockPastLimit: userData?.allowShockPastLimit || false,
      useShockPastLimit: userData?.useShockPastLimit || false,
      controllerPlusEnabled: hasControllerPlus
    };
    
    await setCachedSkuStatus(env.PISHOCK_KV, userId, result);
    
    return jsonResponse(result, 200, {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
    });
  } catch (error) {
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};

