interface Env {
  PISHOCK_KV: KVNamespace;
}

import { validateDiscordToken } from '../../../lib/discord-auth';
import { encrypt, testPiShockOperation } from '../../../lib/pishock-api';

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

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    if (method === 'PUT') {
      const { apiKey, username, sharecode } = await request.json();

      if (!apiKey || !username || !sharecode) {
        return jsonResponse({ 
          success: false, 
          error: 'Missing required fields: apiKey, username, sharecode' 
        }, 400);
      }

      // Test connection before storing
      const connectionTest = await testPiShockOperation(apiKey, username, sharecode);
      const isConnected = connectionTest.success;
      
      if (!isConnected) {
        return jsonResponse({ 
          success: false, 
          isConnected: false, 
          error: connectionTest.error || 'Failed to connect to PiShock device. Please check your credentials.' 
        });
      }

      // Encrypt and store credentials
      const encrypted = await encrypt({ apiKey, username, sharecode });
      await Promise.all([
        env.PISHOCK_KV.put(`instance:${instanceId}:pishock`, encrypted, { expirationTtl: 21600 }), // 6 hours
        env.PISHOCK_KV.put(`instance:${instanceId}:pishock:lastTested`, new Date().toISOString(), { expirationTtl: 21600 }), // 6 hours
        env.PISHOCK_KV.put(`instance:${instanceId}:pishock:configuredBy`, user.id, { expirationTtl: 21600 }) // 6 hours
      ]);

      return jsonResponse({ success: true, isConnected: true });
    }

    if (method === 'DELETE') {
      await Promise.all([
        env.PISHOCK_KV.delete(`instance:${instanceId}:pishock`),
        env.PISHOCK_KV.delete(`instance:${instanceId}:pishock:lastTested`),
        env.PISHOCK_KV.delete(`instance:${instanceId}:pishock:configuredBy`)
      ]);
      return jsonResponse({ success: true });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('PiShock settings error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};