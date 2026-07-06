import { Hono } from 'hono';
import type { AppEnv } from '../env.js';
import type { DataStore } from '../db/store.js';
import { corsPreflightResponse, jsonResponse, requireBearerToken } from '../lib/http.js';
import { refreshDiscordToken } from '../services/token-utils.js';

export function createTokenRoutes(env: AppEnv, store: DataStore) {
  const app = new Hono();

  app.options('/refresh', () => corsPreflightResponse());
  app.post('/refresh', async (c) => {
    const token = requireBearerToken(c.req.header('authorization'));
    if (!token) return jsonResponse(c, { error: 'Unauthorized' }, 401);

    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return jsonResponse(c, { error: 'Invalid or expired token' }, 401);

    const user = await response.json() as { id: string };
    const accessToken = await refreshDiscordToken(user.id, store, env);
    if (!accessToken) {
      return jsonResponse(c, { success: false, error: 'Token refresh failed' }, 400);
    }

    const metadata = await store.getTokenMetadata(user.id);
    return jsonResponse(c, {
      success: true,
      access_token: accessToken,
      expires_at: metadata?.expires_at,
      message: 'Token refreshed successfully',
    });
  });

  return app;
}
