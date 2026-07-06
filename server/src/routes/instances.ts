import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import type { AppEnv } from '../env.js';
import type { DataStore } from '../db/store.js';
import { corsPreflightResponse, jsonResponse, requireBearerToken } from '../lib/http.js';
import { validateDiscordTokenWithRefresh } from '../services/token-utils.js';
import {
  getGeneratedShareCodeForShocker,
  operatePiShockShocker,
  operatePiShockShareCode,
} from '../services/pishock-client.js';
import { getControllerPlusState } from '../services/discord-entitlements.js';
import { isDevelopment } from '../lib/dev.js';

export function createInstanceRoutes(env: AppEnv, store: DataStore) {
  const app = new Hono();

  app.options('/*', () => corsPreflightResponse());

  app.get('/:instanceId/data', async (c) => {
    const token = requireBearerToken(c.req.header('authorization'));
    if (!token) return jsonResponse(c, 'Unauthorized', 401);
    const user = await validateDiscordTokenWithRefresh(token, store, env);
    if (!user) return jsonResponse(c, 'Invalid token', 401);
    const data = await store.getInstanceData(c.req.param('instanceId'));
    return jsonResponse(c, data);
  });

  app.put('/:instanceId/data', async (c) => {
    const token = requireBearerToken(c.req.header('authorization'));
    if (!token) return jsonResponse(c, 'Unauthorized', 401);
    const user = await validateDiscordTokenWithRefresh(token, store, env);
    if (!user) return jsonResponse(c, 'Invalid token', 401);
    const update = await c.req.json<Record<string, unknown>>();
    await store.putInstanceData(c.req.param('instanceId'), update, String(user.id));
    return jsonResponse(c, { success: true });
  });

  app.get('/:instanceId/status', async (c) => {
    const token = requireBearerToken(c.req.header('authorization'));
    if (!token) return jsonResponse(c, 'Unauthorized', 401);
    const user = await validateDiscordTokenWithRefresh(token, store, env);
    if (!user) return jsonResponse(c, 'Invalid token', 401);
    const instanceId = c.req.param('instanceId');
    const status = await store.getInstanceStatus(instanceId);
    if (status) return jsonResponse(c, status);
    if (isDevelopment(env)) {
      return jsonResponse(c, {
        status: 'active',
        devBypass: true,
        instance_id: instanceId,
        last_activity: new Date().toISOString(),
      });
    }
    return jsonResponse(c, { status: 'unknown' });
  });

  app.post('/:instanceId/pishock-multishock', async (c) => {
    const token = requireBearerToken(c.req.header('authorization'));
    if (!token) return jsonResponse(c, 'Unauthorized', 401);
    const user = await validateDiscordTokenWithRefresh(token, store, env);
    if (!user) return jsonResponse(c, 'Invalid token', 401);

    const { executorUserId, targets, intensity, duration, operation } = await c.req.json<{
      executorUserId: string;
      targets: Array<{ userId: string; shockerIds?: string[] }>;
      intensity: number;
      duration: number;
      operation: number;
    }>();

    if (!executorUserId || user.id !== executorUserId) {
      return jsonResponse(c, { success: false, error: 'Executor mismatch.' }, 403);
    }
    if (!Array.isArray(targets) || targets.length === 0) {
      return jsonResponse(c, { success: false, error: 'At least one target is required.' }, 400);
    }
    if (intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse(c, { success: false, error: 'Invalid parameters.' }, 400);
    }

    const entitlementState = await getControllerPlusState(env, executorUserId);
    if (!entitlementState.hasControllerPlus) {
      return jsonResponse(c, { success: false, error: 'Controller+ entitlement is required for multishock.' }, 403);
    }

    const failures: Array<{ targetUserId: string; shockerId?: string; error: string }> = [];
    let successCount = 0;
    const operationNames = ['shock', 'vibrate', 'beep'];

    for (const target of targets) {
      const targetData = await store.getUserData(target.userId);
      if (!targetData?.credentials) {
        failures.push({ targetUserId: target.userId, error: 'No PiShock settings' });
        continue;
      }
      if (targetData.commandsPaused) {
        failures.push({ targetUserId: target.userId, error: 'Commands paused' });
        continue;
      }
      if (targetData.bannedExecutors?.includes(executorUserId)) {
        failures.push({ targetUserId: target.userId, error: 'Executor banned' });
        continue;
      }

      const creds = store.decryptCredentials(targetData.credentials);
      const shockerIds = (target.shockerIds?.length ? target.shockerIds : [String(creds.selectedShockerId || creds.shockerId || '')])
        .filter(Boolean);

      for (const shockerId of shockerIds) {
        const pishockCredentials = {
          apiKey: String(creds.apiKey),
          username: String(creds.username),
          piShockUserId: String(creds.piShockUserId || ''),
        };
        const shareCode = getGeneratedShareCodeForShocker(creds.generatedShareCodes, shockerId) || '';
        const operateResult = shareCode
          ? await operatePiShockShareCode(pishockCredentials, shareCode, {
              operation, intensity, durationSeconds: duration, agentName: 'DiscordActivityMultishock',
            })
          : await operatePiShockShocker(pishockCredentials, shockerId, {
              operation, intensity, durationSeconds: duration, agentName: 'DiscordActivityMultishock',
            });

        if (operateResult.ok) {
          successCount += 1;
          void store.addActivityLogEntry({
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            instanceId: c.req.param('instanceId'),
            executorUserId,
            executorUsername: String(user.global_name || user.username || 'Unknown User'),
            targetUserId: target.userId,
            targetUsername: 'Unknown User',
            action: operationNames[operation] as 'shock' | 'vibrate' | 'beep',
            intensity,
            duration,
          });
        } else {
          failures.push({
            targetUserId: target.userId,
            shockerId,
            error: operateResult.error || 'Operation failed',
          });
        }
      }
    }

    if (failures.length > 0 && successCount > 0) {
      return jsonResponse(c, { success: true, partialSuccess: true, targetCount: targets.length, failures }, 207);
    }
    if (failures.length > 0) {
      return jsonResponse(c, { success: false, error: failures[0]?.error || 'Multishock failed', failures }, 400);
    }
    return jsonResponse(c, { success: true, targetCount: targets.length });
  });

  return app;
}
