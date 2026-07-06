import { Hono } from 'hono';
import type { AppEnv } from '../env.js';
import type { DataStore } from '../db/store.js';
import { corsPreflightResponse, jsonResponse, requireBearerToken } from '../lib/http.js';
import { validateDiscordTokenWithRefresh } from '../services/token-utils.js';
import { prisma } from '../lib/prisma.js';

export function createDiscordRoutes(env: AppEnv, store: DataStore) {
  const app = new Hono();

  app.options('/guilds/:guildId/members/:userId', () => corsPreflightResponse());

  app.get('/guilds/:guildId/members/:userId', async (c) => {
    const token = requireBearerToken(c.req.header('authorization'));
    if (!token) return jsonResponse(c, 'Unauthorized', 401);
    const user = await validateDiscordTokenWithRefresh(token, store, env);
    if (!user) return jsonResponse(c, 'Invalid token', 401);

    const guildId = c.req.param('guildId');
    const userId = c.req.param('userId');
    const cacheKey = `discord_guild_member:${guildId}:${userId}`;

    const cached = await prisma.statusCache.findFirst({
      where: { cacheKey, expiresAt: { gt: new Date() } },
    });
    if (cached?.payloadJson) {
      return c.json(cached.payloadJson, 200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      });
    }

    const response = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return jsonResponse(c, { error: 'Failed to fetch guild member' }, response.status as 400);
    }

    const memberData = await response.json();
    await prisma.discordUser.upsert({
      where: { id: String(user.id) },
      create: { id: String(user.id) },
      update: {},
    });
    await prisma.statusCache.upsert({
      where: { discordUserId: String(user.id) },
      create: {
        discordUserId: String(user.id),
        cacheKey,
        payloadJson: memberData as object,
        expiresAt: new Date(Date.now() + 600_000),
      },
      update: {
        cacheKey,
        payloadJson: memberData as object,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    return c.json(memberData, 200, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    });
  });

  return app;
}
