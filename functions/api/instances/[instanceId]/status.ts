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
    
    return userData;
  } catch (error) {
    console.error('TOKEN_VALIDATION: Error validating token:', error);
    return null;
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const method = request.method;
  const instanceId = params.instanceId as string;

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

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    if (method === 'GET') {
      // Get instance status
      const statusData = await env.PISHOCK_KV.get(`instance:${instanceId}:status`);
      
      if (!statusData) {
        // Instance doesn't exist or has expired
        return new Response('Instance not found or expired', { status: 404 });
      }

      const status = JSON.parse(statusData);
      return jsonResponse(status);
    }

    if (method === 'PUT') {
      // Update instance status
      const { status: newStatus, participant_count = 0 } = await request.json();
      
      if (!['active', 'inactive'].includes(newStatus)) {
        return jsonResponse({ 
          error: 'Invalid status. Must be "active" or "inactive"' 
        }, 400);
      }

      const existingData = await env.PISHOCK_KV.get(`instance:${instanceId}:status`);
      const existing = existingData ? JSON.parse(existingData) : {};

      const statusData = {
        ...existing,
        status: newStatus,
        participant_count,
        last_activity: new Date().toISOString(),
        updated_by: user.id,
        ...(newStatus === 'inactive' && !existing.inactive_since ? { 
          inactive_since: new Date().toISOString() 
        } : {}),
        ...(newStatus === 'active' ? { 
          inactive_since: null,
          reactivated_at: new Date().toISOString()
        } : {})
      };

      // Store with 7-day TTL for cleanup
      await env.PISHOCK_KV.put(
        `instance:${instanceId}:status`, 
        JSON.stringify(statusData), 
        { expirationTtl: 21600 } // 6 hours
      );

      console.log(`Instance ${instanceId} status updated to ${newStatus} by user ${user.id}`);

      return jsonResponse({ 
        success: true, 
        status: statusData 
      });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('Instance status error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};