import { Hono } from 'hono';
import type { AppEnv } from './env.js';
import { DataStore } from './db/store.js';
import { securityHeaders } from './middleware/security.js';
import { createAuthRoutes } from './routes/auth.js';
import { createTokenRoutes } from './routes/token.js';
import { createVerifyInstanceRoutes } from './routes/verify-instance.js';
import { createUserRoutes } from './routes/users.js';
import { createInstanceRoutes } from './routes/instances.js';
import { createMonetizationRoutes } from './routes/monetization.js';
import { createAdminRoutes } from './routes/admin.js';
import { createActivityLogRoutes } from './routes/activity-log.js';
import { createDiscordRoutes } from './routes/discord.js';
import { jsonResponse } from './lib/http.js';

export function createApp(env: AppEnv) {
  const store = new DataStore(env.ENCRYPTION_KEY);
  const app = new Hono();

  app.use('*', securityHeaders);

  const mountApi = (prefix: string) => {
    app.route(`${prefix}/auth`, createAuthRoutes(env, store));
    app.route(`${prefix}/token`, createTokenRoutes(env, store));
    app.route(`${prefix}/verify-instance`, createVerifyInstanceRoutes(env, store));
    app.route(`${prefix}/users`, createUserRoutes(env, store));
    app.route(`${prefix}/instances`, createInstanceRoutes(env, store));
    app.route(`${prefix}/monetization`, createMonetizationRoutes(env, store));
    app.route(`${prefix}/admin`, createAdminRoutes(env, store));
    app.route(`${prefix}/activity-log`, createActivityLogRoutes(env, store));
    app.route(`${prefix}/discord`, createDiscordRoutes(env, store));
    app.get(`${prefix}/health`, (c) => jsonResponse(c, { ok: true, service: 'pishock-discord-activity' }));
    app.get(`${prefix}/version`, (c) => jsonResponse(c, { version: '2.0.0', runtime: 'node' }));
  };

  mountApi('/api');
  mountApi('/.proxy/api');

  return { app, store };
}
