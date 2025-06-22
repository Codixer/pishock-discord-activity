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

// Debounce helper to prevent excessive writes
const pendingWrites = new Map<string, any>();
const writeTimeouts = new Map<string, NodeJS.Timeout>();

async function debouncedWrite(kv: KVNamespace, key: string, value: any, delay = 2000) {
  // Cancel existing timeout for this key
  const existingTimeout = writeTimeouts.get(key);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }
  
  // Store pending write
  pendingWrites.set(key, value);
  
  // Set new timeout
  const timeout = setTimeout(async () => {
    const pendingValue = pendingWrites.get(key);
    if (pendingValue) {
      await kv.put(key, JSON.stringify(pendingValue));
      pendingWrites.delete(key);
      writeTimeouts.delete(key);
    }
  }, delay);
  
  writeTimeouts.set(key, timeout);
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

  const user = await validateDiscordToken(token);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    if (method === 'GET') {
      const data = await env.PISHOCK_KV.get(`instance_data:${instanceId}`);
      return jsonResponse(data ? JSON.parse(data) : {});
    }

    if (method === 'PUT') {
      const update = await request.json();
      const existing = await env.PISHOCK_KV.get(`instance_data:${instanceId}`);
      const merged = { 
        ...(existing ? JSON.parse(existing) : {}), 
        ...update,
        lastUpdated: new Date().toISOString(),
        updatedBy: user.id
      };
      
      // Use debounced write to prevent excessive updates
      await debouncedWrite(env.PISHOCK_KV, `instance_data:${instanceId}`, merged);
      return jsonResponse({ success: true });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('Instance data error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};