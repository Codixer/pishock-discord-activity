import { CONTROLLER_PLUS_SKU_ID, OVERLIMIT_CONSUMABLE_SKU_ID, getControllerPlusState } from '../_shared/discord-entitlements';
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
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const token = requireAuth(request);
  if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);

  const user = await validateDiscordTokenWithRefresh(token, env.PISHOCK_KV, {
    PISHOCK_KV: env.PISHOCK_KV,
    DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID || '',
    DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET || '',
  });
  if (!user) return jsonResponse({ error: 'Invalid token' }, 401);

  try {
    const state = await getControllerPlusState(env, user.id);
    return jsonResponse({
      userId: user.id,
      controllerPlusSkuId: CONTROLLER_PLUS_SKU_ID,
      overlimitConsumableSkuId: OVERLIMIT_CONSUMABLE_SKU_ID,
      hasControllerPlus: state.hasControllerPlus,
      hasOverlimitConsumable: state.hasOverlimitConsumable,
      overlimitEntitlementId: state.overlimitEntitlementId || null,
      entitlements: state.entitlements,
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Failed to load entitlements',
    }, 500);
  }
};
