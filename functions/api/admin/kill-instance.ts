interface Env {
  PISHOCK_KV: KVNamespace;
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

const ADMIN_USER_ID = '173839105615069184';

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

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token);
  if (!user) return new Response('Invalid token', { status: 401 });

  // Check if user is admin
  if (user.id !== ADMIN_USER_ID) {
    console.log(`Non-admin user ${user.id} attempted to access admin kill endpoint`);
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const { instanceId, reason = 'Admin kill' } = await request.json();

    if (!instanceId) {
      return jsonResponse({ 
        error: 'Instance ID is required' 
      }, 400);
    }

    console.log(`=== ADMIN KILL INSTANCE ===`);
    console.log(`Admin ${user.username} (${user.id}) killing instance: ${instanceId}`);
    console.log(`Reason: ${reason}`);

    // Get current instance status
    const existingData = await env.PISHOCK_KV.get(`instance:${instanceId}:status`);
    const existing = existingData ? JSON.parse(existingData) : {};

    // Force instance to inactive state
    const killData = {
      ...existing,
      status: 'inactive',
      participant_count: 0,
      last_activity: new Date().toISOString(),
      killed_by: user.id,
      killed_at: new Date().toISOString(),
      kill_reason: reason,
      inactive_since: existing.inactive_since || new Date().toISOString(),
      admin_killed: true
    };

    // Store with 7-day TTL
    await env.PISHOCK_KV.put(
      `instance:${instanceId}:status`, 
      JSON.stringify(killData), 
      { expirationTtl: 604800 } // 7 days
    );

    // Also try to clear any instance data
    try {
      await env.PISHOCK_KV.delete(`instance_data:${instanceId}`);
      await env.PISHOCK_KV.delete(`instance:${instanceId}:data`);
    } catch (error) {
      console.warn('Failed to clear instance data:', error);
    }

    console.log(`✅ Instance ${instanceId} successfully killed by admin`);

    return jsonResponse({ 
      success: true,
      message: `Instance ${instanceId} has been killed`,
      instanceId,
      killedBy: user.username,
      killedAt: killData.killed_at,
      reason
    });

  } catch (error) {
    console.error('Admin kill instance error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};