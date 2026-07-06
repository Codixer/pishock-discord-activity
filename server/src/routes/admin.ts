import { Hono } from 'hono';
import type { AppEnv } from '../env.js';
import type { DataStore } from '../db/store.js';
import { corsPreflightResponse, jsonResponse, requireBearerToken } from '../lib/http.js';
import { requireAdminUser } from '../services/admin-auth.js';
import {
  CONTROLLER_PLUS_SKU_ID,
  OVERLIMIT_CONSUMABLE_SKU_ID,
  createDiscordTestEntitlement,
  deleteDiscordTestEntitlement,
  listDiscordEntitlementsForUser,
} from '../services/discord-entitlements.js';

const MANAGED_SKUS = {
  controllerPlus: CONTROLLER_PLUS_SKU_ID,
  overlimitConsumable: OVERLIMIT_CONSUMABLE_SKU_ID,
};

export function createAdminRoutes(env: AppEnv, store: DataStore) {
  const app = new Hono();

  app.options('/*', () => corsPreflightResponse());

  app.get('/entitlements', async (c) => {
    const auth = await requireAdminUser(requireBearerToken(c.req.header('authorization')), store, env);
    if (!auth.ok) return jsonResponse(c, { success: false, error: auth.error }, auth.status);
    const userId = c.req.query('userId') || '';
    if (!userId) return jsonResponse(c, { success: false, error: 'Missing userId query parameter' }, 400);
    const entitlements = await listDiscordEntitlementsForUser(env, userId, { excludeEnded: false, excludeDeleted: false, limit: 100 });
    return jsonResponse(c, { success: true, userId, managedSkus: MANAGED_SKUS, entitlements });
  });

  app.post('/entitlements', async (c) => {
    const auth = await requireAdminUser(requireBearerToken(c.req.header('authorization')), store, env);
    if (!auth.ok) return jsonResponse(c, { success: false, error: auth.error }, auth.status);
    const body = await c.req.json<{ userId?: string; skuKey?: string }>().catch(() => ({ userId: undefined, skuKey: undefined }));
    const skuId = body.skuKey === 'controllerPlus' ? MANAGED_SKUS.controllerPlus
      : body.skuKey === 'overlimitConsumable' ? MANAGED_SKUS.overlimitConsumable : null;
    if (!body.userId || !skuId) return jsonResponse(c, { success: false, error: 'Missing userId or skuKey' }, 400);
    const entitlement = await createDiscordTestEntitlement(env, skuId, body.userId, 2);
    return jsonResponse(c, { success: true, userId: body.userId, skuKey: body.skuKey, entitlement });
  });

  app.delete('/entitlements', async (c) => {
    const auth = await requireAdminUser(requireBearerToken(c.req.header('authorization')), store, env);
    if (!auth.ok) return jsonResponse(c, { success: false, error: auth.error }, auth.status);
    const body = await c.req.json<{ entitlementId?: string }>().catch(() => ({ entitlementId: undefined }));
    if (!body.entitlementId) return jsonResponse(c, { success: false, error: 'Missing entitlementId' }, 400);
    await deleteDiscordTestEntitlement(env, body.entitlementId);
    return jsonResponse(c, { success: true, entitlementId: body.entitlementId });
  });

  app.get('/users/:userId', async (c) => {
    const auth = await requireAdminUser(requireBearerToken(c.req.header('authorization')), store, env);
    if (!auth.ok) return jsonResponse(c, { success: false, error: auth.error }, auth.status);
    const userId = c.req.param('userId');
    const userData = await store.getUserData(userId);
    const profile = await store.getDiscordUser(userId);
    const tokenMeta = await store.getTokenMetadata(userId);
    return jsonResponse(c, {
      success: true,
      userId,
      profile: profile ? { id: profile.id, username: profile.username, global_name: profile.global_name } : null,
      hasPiShockSettings: Boolean(userData?.credentials),
      tokenMetadata: tokenMeta ? { expires_at: tokenMeta.expires_at, hasRefreshToken: Boolean(tokenMeta.refresh_token) } : null,
    });
  });

  app.delete('/users/:userId', async (c) => {
    const auth = await requireAdminUser(requireBearerToken(c.req.header('authorization')), store, env);
    if (!auth.ok) return jsonResponse(c, { success: false, error: auth.error }, auth.status);
    const userId = c.req.param('userId');
    await store.deleteUserData(userId);
    const anonymized = await store.anonymizeUserInActivityLogs(userId);
    return jsonResponse(c, { success: true, userId, anonymized });
  });

  return app;
}
