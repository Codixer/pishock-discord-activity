import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import type { AppEnv } from '../env.js';
import type { DataStore } from '../db/store.js';
import { corsPreflightResponse, jsonResponse, requireBearerToken } from '../lib/http.js';
import { validateDiscordTokenWithRefresh } from '../services/token-utils.js';

export function createActivityLogRoutes(env: AppEnv, store: DataStore) {
  const app = new Hono();

  app.options('/', () => corsPreflightResponse());

  app.get('/', async (c) => {
    const token = requireBearerToken(c.req.header('authorization'));
    if (!token) return jsonResponse(c, 'Unauthorized', 401);
    const user = await validateDiscordTokenWithRefresh(token, store, env);
    if (!user) return jsonResponse(c, 'Invalid token', 401);

    const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 500);
    const offset = parseInt(c.req.query('offset') || '0', 10);
    const since = c.req.query('since') || undefined;
    const { entries, total } = await store.listActivityLogEntries({ limit, offset, since });
    return jsonResponse(c, { entries, total, hasMore: offset + limit < total });
  });

  app.post('/', async (c) => {
    const token = requireBearerToken(c.req.header('authorization'));
    if (!token) return jsonResponse(c, 'Unauthorized', 401);
    const user = await validateDiscordTokenWithRefresh(token, store, env);
    if (!user) return jsonResponse(c, 'Invalid token', 401);

    const entry = await c.req.json<Record<string, unknown>>();
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    await store.addActivityLogEntry({
      id,
      timestamp,
      instanceId: String(entry.instanceId || 'global'),
      executorUserId: String(entry.executorUserId || user.id),
      executorUsername: String(entry.executorUsername || 'Unknown User'),
      executorAvatar: entry.executorAvatar ? String(entry.executorAvatar) : undefined,
      targetUserId: String(entry.targetUserId || ''),
      targetUsername: String(entry.targetUsername || 'Unknown User'),
      targetAvatar: entry.targetAvatar ? String(entry.targetAvatar) : undefined,
      action: String(entry.action || 'shock'),
      intensity: Number(entry.intensity || 0),
      duration: Number(entry.duration || 0),
      guildId: entry.guildId ? String(entry.guildId) : undefined,
      guildName: entry.guildName ? String(entry.guildName) : undefined,
    });
    return jsonResponse(c, { success: true, entryId: id });
  });

  return app;
}
