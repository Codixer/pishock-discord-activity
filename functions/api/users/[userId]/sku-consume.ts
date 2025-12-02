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
    console.log(`[SKU-CONSUME] Fetching entitlements for user ${userId}`);
    // Use the user endpoint as per Discord API documentation
    // https://discord.com/developers/docs/monetization/implementing-one-time-purchases
    const response = await fetch('https://discord.com/api/v9/users/@me/entitlements', {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    
    console.log(`[SKU-CONSUME] Entitlements API response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SKU-CONSUME] Failed to fetch entitlements: ${response.status} ${response.statusText}`, {
        status: response.status,
        statusText: response.statusText,
        errorBody: errorText,
        userId
      });
      return null;
    }
    
    const entitlements = await response.json();
    console.log(`[SKU-CONSUME] Fetched ${Array.isArray(entitlements) ? entitlements.length : 'non-array'} entitlements for user ${userId}`, {
      entitlementsCount: Array.isArray(entitlements) ? entitlements.length : 0,
      isArray: Array.isArray(entitlements),
      entitlements: Array.isArray(entitlements) ? entitlements.map((ent: any) => ({
        id: ent.id,
        sku_id: ent.sku_id,
        type: ent.type,
        consumed: ent.consumed,
        user_id: ent.user_id,
        gift_code_flags: ent.gift_code_flags,
        ends_at: ent.ends_at,
        starts_at: ent.starts_at
      })) : entitlements
    });
    return entitlements;
  } catch (error) {
    console.error(`[SKU-CONSUME] Exception while fetching entitlements for user ${userId}:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return null;
  }
}

async function consumeEntitlement(token: string, entitlementId: string, applicationId: string): Promise<boolean> {
  try {
    console.log(`[SKU-CONSUME] Attempting to consume entitlement ${entitlementId}`);
    // Use POST method on applications endpoint as per Discord API documentation
    // POST /applications/{application.id}/entitlements/{entitlement.id}/consume
    // https://discord.com/developers/docs/monetization/implementing-one-time-purchases
    const url = `https://discord.com/api/v9/applications/${applicationId}/entitlements/${entitlementId}/consume`;
    console.log(`[SKU-CONSUME] Consume API URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    
    console.log(`[SKU-CONSUME] Consume API response status: ${response.status} ${response.statusText}`);
    
    // Discord API returns 204 No Content on success
    if (response.status === 204 || response.ok) {
      console.log(`[SKU-CONSUME] Successfully consumed entitlement ${entitlementId}`, {
        entitlementId,
        responseStatus: response.status
      });
      return true;
    } else {
      const errorBody = await response.text();
      console.error(`[SKU-CONSUME] Failed to consume entitlement ${entitlementId}`, {
        entitlementId,
        status: response.status,
        statusText: response.statusText,
        errorBody: errorBody || '(empty)',
        headers: Object.fromEntries(response.headers.entries())
      });
      return false;
    }
  } catch (error) {
    console.error(`[SKU-CONSUME] Exception while consuming entitlement ${entitlementId}:`, {
      entitlementId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const method = request.method;
  const userId = params.userId as string;

  console.log(`[SKU-CONSUME] Request received: ${method} for user ${userId}`, {
    method,
    userId,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries())
  });

  // Handle CORS preflight requests
  if (method === 'OPTIONS') {
    console.log(`[SKU-CONSUME] Handling CORS preflight request`);
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
    console.log(`[SKU-CONSUME] Method not allowed: ${method}`);
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) {
    console.error(`[SKU-CONSUME] No auth token provided for user ${userId}`);
    return new Response('Unauthorized', { status: 401 });
  }
  console.log(`[SKU-CONSUME] Auth token extracted (length: ${token.length}, last 8: ${token.slice(-8)})`);

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) {
    console.error(`[SKU-CONSUME] Invalid Discord token for user ${userId}`);
    return new Response('Invalid token', { status: 401 });
  }
  console.log(`[SKU-CONSUME] Discord token validated for user ${user.id}`, {
    userId: user.id,
    username: user.username,
    discriminator: user.discriminator
  });

  // Verify the user is consuming their own SKU
  if (user.id !== userId) {
    console.error(`[SKU-CONSUME] User ID mismatch: token user ${user.id} != requested user ${userId}`);
    return jsonResponse({ 
      success: false,
      error: 'Unauthorized to consume this user\'s SKU' 
    }, 403);
  }

  try {
    const requestBody = await request.json();
    console.log(`[SKU-CONSUME] Request body parsed:`, requestBody);
    const { skuId } = requestBody;

    console.log(`[SKU-CONSUME] Validating SKU ID: received="${skuId}", expected="${SHOCK_PAST_LIMIT_SKU_ID}"`);
    if (!skuId || skuId !== SHOCK_PAST_LIMIT_SKU_ID) {
      console.error(`[SKU-CONSUME] Invalid SKU ID provided`, {
        received: skuId,
        expected: SHOCK_PAST_LIMIT_SKU_ID,
        match: skuId === SHOCK_PAST_LIMIT_SKU_ID
      });
      return jsonResponse({ 
        success: false,
        error: 'Invalid SKU ID' 
      }, 400);
    }

    // Fetch user entitlements to find the entitlement to consume
    const entitlements = await fetchUserEntitlements(token, userId);
    
    if (!entitlements || !Array.isArray(entitlements)) {
      console.error(`[SKU-CONSUME] Failed to fetch entitlements or invalid response`, {
        entitlements,
        isArray: Array.isArray(entitlements),
        type: typeof entitlements,
        userId
      });
      return jsonResponse({ 
        success: false,
        error: 'Failed to fetch entitlements' 
      }, 500);
    }

    console.log(`[SKU-CONSUME] Searching for unconsumed entitlement with SKU ID ${SHOCK_PAST_LIMIT_SKU_ID}`);
    console.log(`[SKU-CONSUME] All entitlements for this user:`, entitlements.map((ent: any) => ({
      id: ent.id,
      sku_id: ent.sku_id,
      type: ent.type,
      consumed: ent.consumed,
      user_id: ent.user_id,
      gift_code_flags: ent.gift_code_flags,
      ends_at: ent.ends_at,
      starts_at: ent.starts_at,
      matchesSku: ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID,
      isUnconsumed: !ent.consumed,
      matchesCriteria: ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && !ent.consumed
    })));

    // Find an unconsumed entitlement for this SKU
    // Check by SKU ID and consumed status, not type (type can be 3 or 4)
    const entitlement = entitlements.find((ent: any) => 
      ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && 
      !ent.consumed
    );

    if (!entitlement) {
      console.error(`[SKU-CONSUME] No available consumable entitlement found`, {
        totalEntitlements: entitlements.length,
        matchingSkuId: entitlements.filter((ent: any) => ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID).length,
        unconsumed: entitlements.filter((ent: any) => !ent.consumed).length,
        matchingSkuIdAndUnconsumed: entitlements.filter((ent: any) => 
          ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && !ent.consumed
        ).length
      });
      return jsonResponse({ 
        success: false,
        error: 'No available consumable entitlement found' 
      }, 404);
    }

    console.log(`[SKU-CONSUME] Found entitlement to consume:`, {
      id: entitlement.id,
      sku_id: entitlement.sku_id,
      type: entitlement.type,
      consumed: entitlement.consumed,
      user_id: entitlement.user_id,
      gift_code_flags: entitlement.gift_code_flags,
      ends_at: entitlement.ends_at,
      starts_at: entitlement.starts_at
    });

    // Consume the entitlement
    if (!env.DISCORD_CLIENT_ID) {
      console.error(`[SKU-CONSUME] Cannot consume entitlement: DISCORD_CLIENT_ID not configured`);
      return jsonResponse({ 
        success: false,
        error: 'Server configuration error: Application ID not configured' 
      }, 500);
    }
    
    const consumed = await consumeEntitlement(token, entitlement.id, env.DISCORD_CLIENT_ID);
    
    if (!consumed) {
      console.error(`[SKU-CONSUME] Failed to consume entitlement ${entitlement.id}`);
      return jsonResponse({ 
        success: false,
        error: 'Failed to consume entitlement' 
      }, 500);
    }

    // Invalidate SKU status cache
    try {
      const cacheKey = `cache:sku_status:${userId}`;
      console.log(`[SKU-CONSUME] Invalidating cache: ${cacheKey}`);
      await env.PISHOCK_KV.delete(cacheKey);
      console.log(`[SKU-CONSUME] Cache invalidated successfully`);
    } catch (error) {
      console.error(`[SKU-CONSUME] Error invalidating cache:`, {
        error: error instanceof Error ? error.message : String(error),
        userId
      });
      // Silently handle cache invalidation errors
    }

    console.log(`[SKU-CONSUME] Successfully consumed SKU for user ${userId}`, {
      userId,
      entitlementId: entitlement.id,
      skuId: entitlement.sku_id
    });

    return jsonResponse({ 
      success: true,
      message: 'SKU consumed successfully',
      entitlementId: entitlement.id
    });

  } catch (error) {
    console.error(`[SKU-CONSUME] Exception in request handler:`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId
    });
    return jsonResponse({ 
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};

