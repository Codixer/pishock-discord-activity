import { Hono } from 'hono';
import type { AppEnv } from '../env.js';
import type { DataStore } from '../db/store.js';
import { isDevelopment } from '../lib/dev.js';
import { corsPreflightResponse, instanceExpiresAt, jsonResponse } from '../lib/http.js';

export function createAuthRoutes(env: AppEnv, store: DataStore) {
  const app = new Hono();

  app.options('/discord', () => corsPreflightResponse());
  app.post('/discord', async (c) => {
    try {
      const body = await c.req.json<{ code?: string; instanceId?: string }>();
      const { code, instanceId } = body;
      if (!code || !instanceId) return jsonResponse(c, { error: 'Missing code or instanceId' }, 400);

      if (!isDevelopment(env)) {
        const instanceStatus = await store.getInstanceStatus(instanceId);
        if (instanceStatus?.status === 'inactive') {
          return jsonResponse(c, {
            error: 'This Discord Activity session has ended. Please start a new session.',
            instanceExpired: true,
          }, 403);
        }
      }

      const params = new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
      });

      const discordRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!discordRes.ok) return jsonResponse(c, { error: 'Failed to exchange code' }, 500);

      const tokenData = await discordRes.json() as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        token_type: string;
      };

      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `${tokenData.token_type} ${tokenData.access_token}` },
      });
      if (!userRes.ok) return jsonResponse(c, { error: 'Failed to fetch user' }, 500);

      const user = await userRes.json() as Record<string, unknown>;
      const userId = String(user.id);
      const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;

      await store.putTokenMetadata(userId, {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type,
        user_id: userId,
        created_at: Math.floor(Date.now() / 1000),
      });
      await store.putDiscordUser(userId, user);
      await store.putTokenValidation(
        tokenData.access_token,
        userId,
        { ...user, token_expires_at: expiresAt },
        tokenData.expires_in - 60
      );
      await store.putInstanceStatus(instanceId, {
        status: 'active',
        last_activity: new Date().toISOString(),
        participant_count: 1,
        created_at: new Date().toISOString(),
        last_authenticated_user: userId,
      });

      return jsonResponse(c, { access_token: tokenData.access_token, user });
    } catch (error) {
      return jsonResponse(c, {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }, 500);
    }
  });

  return app;
}
