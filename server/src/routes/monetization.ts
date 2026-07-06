import { Hono } from 'hono';
import type { AppEnv } from '../env.js';
import type { DataStore } from '../db/store.js';
import { corsPreflightResponse, jsonResponse, requireBearerToken } from '../lib/http.js';
import { validateDiscordTokenWithRefresh } from '../services/token-utils.js';
import {
  consumeOverlimitEntitlement,
  getControllerPlusState,
  listDiscordSkus,
} from '../services/discord-entitlements.js';

export function createMonetizationRoutes(env: AppEnv, store: DataStore) {
  const app = new Hono();

  app.options('/*', () => corsPreflightResponse());

  async function auth(c: { req: { header: (n: string) => string | undefined } }) {
    const token = requireBearerToken(c.req.header('authorization'));
    if (!token) return { error: 'Unauthorized', status: 401 as const };
    const user = await validateDiscordTokenWithRefresh(token, store, env);
    if (!user) return { error: 'Invalid token', status: 401 as const };
    return { user };
  }

  app.get('/skus', async (c) => {
    const session = await auth(c);
    if ('error' in session) return jsonResponse(c, session.error, session.status);
    try {
      const skus = await listDiscordSkus(env);
      return jsonResponse(c, { skus });
    } catch (error) {
      return jsonResponse(c, { skus: [], error: error instanceof Error ? error.message : 'Failed to load SKUs' });
    }
  });

  app.get('/entitlements', async (c) => {
    const session = await auth(c);
    if ('error' in session) return jsonResponse(c, session.error, session.status);
    const state = await getControllerPlusState(env, String(session.user.id));
    return jsonResponse(c, state);
  });

  app.post('/consume-overlimit', async (c) => {
    const session = await auth(c);
    if ('error' in session) return jsonResponse(c, session.error, session.status);
    const state = await getControllerPlusState(env, String(session.user.id));
    if (!state.overlimitEntitlementId) {
      return jsonResponse(c, { success: false, error: 'No consumable entitlement available' }, 404);
    }
    await consumeOverlimitEntitlement(env, state.overlimitEntitlementId);
    return jsonResponse(c, { success: true, consumedEntitlementId: state.overlimitEntitlementId });
  });

  app.get('/warning-acks', async (c) => {
    const session = await auth(c);
    if ('error' in session) return jsonResponse(c, session.error, session.status);
    const acks = await store.getWarningAcks(String(session.user.id));
    return jsonResponse(c, { userId: String(session.user.id), ...acks });
  });

  app.post('/warning-acks', async (c) => {
    const session = await auth(c);
    if ('error' in session) return jsonResponse(c, session.error, session.status);
    const userId = String(session.user.id);
    const body = await c.req.json<{
      hasSeenFirstBypassWarning?: boolean;
      hasSeenFirstOverlimitPurchaseWarning?: boolean;
    }>().catch(() => ({
      hasSeenFirstBypassWarning: undefined,
      hasSeenFirstOverlimitPurchaseWarning: undefined,
    }));

    const hasBypassUpdate = typeof body.hasSeenFirstBypassWarning === 'boolean';
    const hasPurchaseUpdate = typeof body.hasSeenFirstOverlimitPurchaseWarning === 'boolean';
    if (!hasBypassUpdate && !hasPurchaseUpdate) {
      return jsonResponse(c, {
        success: false,
        error: 'Expected hasSeenFirstBypassWarning and/or hasSeenFirstOverlimitPurchaseWarning boolean fields.',
      }, 400);
    }

    const latest = await store.getWarningAcks(userId);
    const merged = {
      hasSeenFirstBypassWarning: hasBypassUpdate
        ? latest.hasSeenFirstBypassWarning || Boolean(body.hasSeenFirstBypassWarning)
        : latest.hasSeenFirstBypassWarning,
      hasSeenFirstOverlimitPurchaseWarning: hasPurchaseUpdate
        ? latest.hasSeenFirstOverlimitPurchaseWarning || Boolean(body.hasSeenFirstOverlimitPurchaseWarning)
        : latest.hasSeenFirstOverlimitPurchaseWarning,
    };
    await store.putWarningAcks(userId, merged);
    return jsonResponse(c, { success: true, userId, ...merged });
  });

  return app;
}
