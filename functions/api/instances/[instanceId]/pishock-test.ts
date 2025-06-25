interface Env {
  PISHOCK_KV: KVNamespace;
}

import { validateDiscordToken } from '../../../lib/discord-auth';
import { decrypt, testPiShockOperation } from '../../../lib/pishock-api';

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

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    const encrypted = await env.PISHOCK_KV.get(`instance:${instanceId}:pishock`);
    if (!encrypted) {
      return jsonResponse({ 
        success: false, 
        isConnected: false, 
        error: 'No credentials stored for this instance' 
      });
    }

    try {
      const creds = await decrypt(encrypted);
      const connectionTest = await testPiShockOperation(creds.apiKey, creds.username, creds.sharecode);
      const isConnected = connectionTest.success;
      const lastTested = new Date().toISOString();
      
      await env.PISHOCK_KV.put(`instance:${instanceId}:pishock:lastTested`, lastTested, { expirationTtl: 21600 }); // 6 hours
      
      return jsonResponse({ 
        success: isConnected, 
        isConnected, 
        lastTested,
        error: isConnected ? undefined : connectionTest.error
      });
    } catch (error) {
      console.error('Connection test failed:', error);
      return jsonResponse({ 
        success: false, 
        isConnected: false, 
        error: 'Failed to test connection' 
      });
    }
  } catch (error) {
    console.error('PiShock test error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};