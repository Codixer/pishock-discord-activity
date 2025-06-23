interface Env {
  PISHOCK_KV: KVNamespace;
}

const ADMIN_USER_ID = '173839105615069184';

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

export const onRequest = async (context: { request: Request; env: Env; params: Record<string, string> }) => {
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

  const token = await requireAuth(request);
  if (!token) {
    return jsonResponse({ 
      success: false, 
      error: 'Authorization required' 
    }, 401);
  }

  const user = await validateDiscordToken(token);
  if (!user) {
    return jsonResponse({ 
      success: false, 
      error: 'Invalid authorization token' 
    }, 401);
  }

  // Only allow the specific admin user
  if (user.id !== ADMIN_USER_ID) {
    console.log(`Unauthorized KV wipe attempt by user ${user.id}`);
    return jsonResponse({ 
      success: false, 
      error: 'Unauthorized. This action is restricted to administrators.' 
    }, 403);
  }

  try {
    console.log(`ADMIN: Starting KV wipe requested by admin user ${user.id} (${user.username})`);
    
    // Get all keys in the KV namespace
    const allKeys = await env.PISHOCK_KV.list();
    
    if (allKeys.keys.length === 0) {
      return jsonResponse({
        success: true,
        message: 'KV namespace is already empty',
        keysDeleted: 0
      });
    }
    
    console.log(`ADMIN: Found ${allKeys.keys.length} keys to delete`);
    
    // Delete all keys in batches to avoid timeout
    const batchSize = 100;
    let deletedCount = 0;
    
    for (let i = 0; i < allKeys.keys.length; i += batchSize) {
      const batch = allKeys.keys.slice(i, i + batchSize);
      const deletePromises = batch.map(key => env.PISHOCK_KV.delete(key.name));
      
      await Promise.all(deletePromises);
      deletedCount += batch.length;
      
      console.log(`ADMIN: Deleted batch ${Math.ceil((i + 1) / batchSize)} (${deletedCount}/${allKeys.keys.length} keys)`);
    }
    
    console.log(`ADMIN: ✓ Successfully wiped ${deletedCount} keys from KV namespace`);
    
    return jsonResponse({
      success: true,
      message: `Successfully deleted all ${deletedCount} keys from KV namespace`,
      keysDeleted: deletedCount,
      adminUser: user.username
    });

  } catch (error) {
    console.error('ADMIN: KV wipe failed:', error);
    return jsonResponse({
      success: false,
      error: 'Failed to wipe KV namespace',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};