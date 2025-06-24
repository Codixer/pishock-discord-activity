interface Env {
  DISCORD_BOT_TOKEN: string;
  PISHOCK_KV: KVNamespace;
}

interface DiscordEntitlement {
  id: string;
  sku_id: string;
  user_id: string;
  guild_id?: string;
  application_id: string;
  type: number;
  consumed?: boolean;
  starts_at?: string;
  ends_at?: string;
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

async function requireAuth(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

async function validateDiscordToken(token: string): Promise<any> {
  try {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error('Invalid Discord token');
    }
    
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function fetchUserEntitlements(userId: string, botToken: string): Promise<DiscordEntitlement[]> {
  try {
    console.log('ENTITLEMENTS: Fetching entitlements for user:', userId);
    
    const response = await fetch(`https://discord.com/api/v10/applications/@me/entitlements?user_id=${userId}`, {
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ENTITLEMENTS: Discord API error:', response.status, errorText);
      throw new Error(`Discord API error: ${response.status} - ${errorText}`);
    }

    const entitlements = await response.json();
    console.log('ENTITLEMENTS: Found', entitlements.length, 'entitlements for user:', userId);
    
    return entitlements;
  } catch (error) {
    console.error('ENTITLEMENTS: Failed to fetch user entitlements:', error);
    throw error;
  }
}

async function consumeEntitlement(entitlementId: string, botToken: string): Promise<boolean> {
  try {
    console.log('ENTITLEMENTS: Consuming entitlement:', entitlementId);
    
    const response = await fetch(`https://discord.com/api/v10/applications/@me/entitlements/${entitlementId}/consume`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 204) {
      console.log('ENTITLEMENTS: ✓ Successfully consumed entitlement:', entitlementId);
      return true;
    } else {
      const errorText = await response.text();
      console.error('ENTITLEMENTS: Failed to consume entitlement:', response.status, errorText);
      return false;
    }
  } catch (error) {
    console.error('ENTITLEMENTS: Error consuming entitlement:', error);
    return false;
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const method = request.method;
  const url = new URL(request.url);
  const { searchParams } = url;

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

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    if (method === 'GET') {
      // Get user entitlements
      const userId = searchParams.get('user_id') || user.id;
      const skuId = searchParams.get('sku_id');

      if (!env.DISCORD_BOT_TOKEN) {
        console.error('DISCORD_BOT_TOKEN not configured');
        return jsonResponse({ 
          error: 'Bot token not configured' 
        }, 500);
      }

      const entitlements = await fetchUserEntitlements(userId, env.DISCORD_BOT_TOKEN);
      
      // Filter by SKU if specified
      const filteredEntitlements = skuId 
        ? entitlements.filter(e => e.sku_id === skuId)
        : entitlements;

      // Process entitlements to include useful information
      const processedEntitlements = filteredEntitlements.map(entitlement => ({
        id: entitlement.id,
        sku_id: entitlement.sku_id,
        user_id: entitlement.user_id,
        type: entitlement.type,
        consumed: entitlement.consumed || false,
        starts_at: entitlement.starts_at,
        ends_at: entitlement.ends_at,
        is_active: !entitlement.ends_at || new Date(entitlement.ends_at) > new Date(),
        is_consumable: entitlement.type === 8, // Type 8 is consumable
      }));

      return jsonResponse({ 
        entitlements: processedEntitlements,
        total: processedEntitlements.length 
      });
    }

    if (method === 'POST') {
      // Consume an entitlement
      const { entitlement_id } = await request.json();

      if (!entitlement_id) {
        return jsonResponse({ 
          error: 'Missing entitlement_id' 
        }, 400);
      }

      if (!env.DISCORD_BOT_TOKEN) {
        console.error('DISCORD_BOT_TOKEN not configured');
        return jsonResponse({ 
          error: 'Bot token not configured' 
        }, 500);
      }

      const success = await consumeEntitlement(entitlement_id, env.DISCORD_BOT_TOKEN);
      
      return jsonResponse({ 
        success,
        consumed: success 
      });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('Entitlements API error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};