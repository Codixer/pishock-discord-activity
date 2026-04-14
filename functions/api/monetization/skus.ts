import { CONTROLLER_PLUS_SKU_ID, OVERLIMIT_CONSUMABLE_SKU_ID, listDiscordSkus } from '../_shared/discord-entitlements';
import { validateDiscordTokenWithRefresh } from '../_shared/token-utils';

interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_BOT_TOKEN?: string;
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function requireAuth(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordTokenWithRefresh(token, env.PISHOCK_KV, {
    PISHOCK_KV: env.PISHOCK_KV,
    DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID || '',
    DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET || '',
  });
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    const skus = await listDiscordSkus(env);
    const controllerPlus = skus.find((sku) => sku.id === CONTROLLER_PLUS_SKU_ID) || null;
    const overlimit = skus.find((sku) => sku.id === OVERLIMIT_CONSUMABLE_SKU_ID) || null;

    return jsonResponse({
      controllerPlus,
      overlimitConsumable: overlimit,
      skus,
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Failed to load SKUs',
    }, 500);
  }
};
