import { Hono } from 'hono';
import type { AppEnv } from '../env.js';
import type { DataStore } from '../db/store.js';
import { isDevelopment } from '../lib/dev.js';
import { corsPreflightResponse, jsonResponse } from '../lib/http.js';

export function createVerifyInstanceRoutes(env: AppEnv, store: DataStore) {
  const app = new Hono();

  app.options('/', () => corsPreflightResponse());
  app.get('/', async (c) => {
    const applicationId = c.req.query('application_id');
    const instanceId = c.req.query('instance_id');
    if (!applicationId || !instanceId) {
      return jsonResponse(c, { valid: false, error: 'Missing application_id or instance_id parameters' }, 400);
    }

    if (isDevelopment(env)) {
      const now = new Date().toISOString();
      await store.putInstanceStatus(instanceId, {
        status: 'active',
        created_at: now,
        last_activity: now,
        last_verified: now,
        participant_count: 0,
        discord_verified: false,
        dev_bypass: true,
      });
      return jsonResponse(c, {
        valid: true,
        devBypass: true,
        instanceData: {
          instanceId,
          applicationId,
          participantCount: 0,
          verifiedAt: now,
        },
      });
    }
    if (!env.DISCORD_BOT_TOKEN) {
      return jsonResponse(c, { valid: false, error: 'Server configuration error' }, 500);
    }

    try {
      const discordResponse = await fetch(
        `https://discord.com/api/applications/${applicationId}/activity-instances/${instanceId}`,
        {
          headers: {
            Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
            'User-Agent': 'PiShock-Discord-Activity/2.0',
          },
        }
      );

      if (discordResponse.status === 404) {
        await store.deleteInstance(instanceId);
        return jsonResponse(c, {
          valid: false,
          error: 'Discord Activity session not found or has expired. Please start a new session from Discord.',
        }, 404);
      }

      if (!discordResponse.ok) {
        return jsonResponse(c, { valid: false, error: `Discord API error: ${discordResponse.status}` }, 502);
      }

      const instanceData = await discordResponse.json() as {
        instance_id?: string;
        application_id?: string;
        users?: unknown[];
        location?: unknown;
      };

      const now = new Date().toISOString();
      await store.putInstanceStatus(instanceId, {
        status: 'active',
        created_at: now,
        last_activity: now,
        last_verified: now,
        participant_count: instanceData.users?.length || 0,
        discord_verified: true,
        location: instanceData.location,
      });

      return jsonResponse(c, {
        valid: true,
        instanceData: {
          instanceId: instanceData.instance_id,
          applicationId: instanceData.application_id,
          participantCount: instanceData.users?.length || 0,
          location: instanceData.location,
          verifiedAt: now,
        },
      });
    } catch {
      const kvStatus = await store.getInstanceStatus(instanceId);
      if (kvStatus?.status === 'active' && kvStatus.last_verified) {
        const lastVerified = new Date(String(kvStatus.last_verified));
        if (lastVerified > new Date(Date.now() - 3600000)) {
          return jsonResponse(c, {
            valid: true,
            instanceData: {
              instanceId,
              fallback: true,
              lastVerified: kvStatus.last_verified,
              participantCount: kvStatus.participant_count || 0,
            },
          });
        }
      }
      return jsonResponse(c, {
        valid: false,
        error: 'Instance verification failed due to network error. Please try again.',
        temporary: true,
      }, 503);
    }
  });

  return app;
}
