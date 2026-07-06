import {
  CONTROLLER_PLUS_SKU_ID,
  DiscordApiRequestError,
  OVERLIMIT_CONSUMABLE_SKU_ID,
  createDiscordTestEntitlement,
  deleteDiscordTestEntitlement,
  listDiscordEntitlementsForUser,
} from '../_shared/discord-entitlements';
import { requireAdminUser } from '../_shared/admin-auth';

interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_BOT_TOKEN?: string;
  OWNER_ADMIN_USER_IDS?: string;
}

type ManagedSkuKey = 'controllerPlus' | 'overlimitConsumable';

const MANAGED_SKUS: Record<ManagedSkuKey, string> = {
  controllerPlus: CONTROLLER_PLUS_SKU_ID,
  overlimitConsumable: OVERLIMIT_CONSUMABLE_SKU_ID,
};

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function getManagedSku(key: string): string | null {
  if (key === 'controllerPlus') return MANAGED_SKUS.controllerPlus;
  if (key === 'overlimitConsumable') return MANAGED_SKUS.overlimitConsumable;
  return null;
}

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const authResult = await requireAdminUser(request, env);
  if (!authResult.ok) {
    return jsonResponse({ success: false, error: authResult.error }, authResult.status);
  }

  try {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const userId = url.searchParams.get('userId') || '';
      if (!userId) {
        return jsonResponse({ success: false, error: 'Missing userId query parameter' }, 400);
      }

      const entitlements = await listDiscordEntitlementsForUser(env, userId, {
        excludeEnded: false,
        excludeDeleted: false,
        limit: 100,
      });

      return jsonResponse({
        success: true,
        userId,
        managedSkus: MANAGED_SKUS,
        entitlements,
      });
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const userId = typeof body.userId === 'string' ? body.userId : '';
      const skuKey = typeof body.skuKey === 'string' ? body.skuKey : '';
      if (!userId || !skuKey) {
        return jsonResponse({ success: false, error: 'Missing userId or skuKey' }, 400);
      }

      const skuId = getManagedSku(skuKey);
      if (!skuId) {
        return jsonResponse({ success: false, error: 'Unsupported skuKey' }, 400);
      }

      console.log(
        '[admin/entitlements] create test entitlement',
        JSON.stringify({
          discordApplicationId: env.DISCORD_CLIENT_ID ?? null,
          managedSkus: MANAGED_SKUS,
          skuKey,
          resolvedSkuId: skuId,
          targetUserId: userId,
        })
      );

      const entitlement = await createDiscordTestEntitlement(env, skuId, userId, 2);
      return jsonResponse({
        success: true,
        userId,
        skuKey,
        entitlement,
      });
    }

    if (request.method === 'DELETE') {
      const body = await request.json().catch(() => ({}));
      const entitlementId = typeof body.entitlementId === 'string' ? body.entitlementId : '';
      if (!entitlementId) {
        return jsonResponse({ success: false, error: 'Missing entitlementId' }, 400);
      }

      await deleteDiscordTestEntitlement(env, entitlementId);
      return jsonResponse({
        success: true,
        entitlementId,
      });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    if (error instanceof DiscordApiRequestError) {
      const status = error.status >= 500 ? 502 : error.status;
      return jsonResponse(
        {
          success: false,
          error: error.message,
          discordStatus: error.status,
        },
        status
      );
    }
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to manage test entitlements',
      },
      500
    );
  }
};
