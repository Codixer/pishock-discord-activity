import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import type { AppEnv } from '../env.js';
import type { DataStore } from '../db/store.js';
import { corsPreflightResponse, jsonResponse, requireBearerToken } from '../lib/http.js';
import { validateDiscordTokenWithRefresh } from '../services/token-utils.js';
import {
  generateLegacyShareCodesForOwnedShockers,
  getAllowedShockersForController,
  getGeneratedShareCodeForShocker,
  getPiShockAccount,
  getPreferredOwnedShockers,
  mapShockersToOptions,
  normalizeGeneratedShareCodes,
  operatePiShockShocker,
  operatePiShockShareCode,
} from '../services/pishock-client.js';
import { consumeOverlimitEntitlement, getControllerPlusState } from '../services/discord-entitlements.js';

async function authUser(c: { req: { header: (n: string) => string | undefined } }, store: DataStore, env: AppEnv) {
  const token = requireBearerToken(c.req.header('authorization'));
  if (!token) return { error: 'Unauthorized', status: 401 as const };
  const user = await validateDiscordTokenWithRefresh(token, store, env);
  if (!user) return { error: 'Invalid token', status: 401 as const };
  return { user, token };
}

async function validatePiShockCredentials(apiKey: string, username: string) {
  const accountResult = await getPiShockAccount({ apiKey, username });
  if (!accountResult.ok) {
    return { valid: false as const, error: accountResult.error || 'Credential validation failed', debugInfo: { status: accountResult.status } };
  }
  const userId = accountResult.data?.UserId;
  if (userId === undefined || userId === null) {
    return { valid: false as const, error: 'No UserID found in API response' };
  }
  return { valid: true as const, userId: String(userId), debugInfo: { account: accountResult.data } };
}

async function checkUserDevices(apiKey: string, username: string, piShockUserId?: string) {
  const allowed = await getAllowedShockersForController({ apiKey, username, piShockUserId });
  if (!allowed.ok || !allowed.data) {
    return { hasDevices: false, error: allowed.error, debugInfo: { status: allowed.status }, shockerIdsHiddenNotOnDevices: 0 };
  }
  const devices = getPreferredOwnedShockers(allowed.data);
  return {
    hasDevices: devices.length > 0,
    devices,
    shockerIdsHiddenNotOnDevices: allowed.data.shockerIdsHiddenNotOnDevices,
    debugInfo: { deviceCount: devices.length },
  };
}

export function createUserRoutes(env: AppEnv, store: DataStore) {
  const app = new Hono();

  const opts = () => corsPreflightResponse();

  app.options('/:userId/pishock-settings', opts);
  app.options('/:userId/pishock-status', opts);
  app.options('/:userId/pishock-test', opts);
  app.options('/:userId/pishock-execute', opts);

  app.get('/:userId/pishock-settings', async (c) => {
    const userId = c.req.param('userId');
    const auth = await authUser(c, store, env);
    if ('error' in auth) return jsonResponse(c, auth.error, auth.status);
    if (auth.user.id !== userId) return jsonResponse(c, 'Forbidden', 403);

    const userData = await store.getUserData(userId);
    if (!userData?.credentials) {
      return jsonResponse(c, { hasSettings: false, settings: null, bannedExecutors: [] });
    }

    try {
      const creds = store.decryptCredentials(userData.credentials);
      let availableShockers: ReturnType<typeof mapShockersToOptions> = [];
      let shockerIdsHiddenNotOnDevices = 0;
      let resolvedPiShockUserId = creds.piShockUserId as string | undefined;
      if (creds.apiKey && creds.username) {
        const validation = await validatePiShockCredentials(String(creds.apiKey), String(creds.username));
        if (validation.valid && validation.userId) resolvedPiShockUserId = validation.userId;
        const allowedResult = await getAllowedShockersForController({
          apiKey: String(creds.apiKey),
          username: String(creds.username),
          piShockUserId: resolvedPiShockUserId,
        });
        if (allowedResult.ok && allowedResult.data) {
          availableShockers = mapShockersToOptions(getPreferredOwnedShockers(allowedResult.data));
          shockerIdsHiddenNotOnDevices = allowedResult.data.shockerIdsHiddenNotOnDevices;
        }
      }
      const ownedShockerIds = new Set(availableShockers.map((s) => s.id));
      const usingLegacySharecodeFallback = Boolean(creds.sharecode && !creds.selectedShockerId);
      const generatedShareCodes = normalizeGeneratedShareCodes(creds.generatedShareCodes);
      const storedSelectedShockerId = String(creds.selectedShockerId || creds.shockerId || '');
      const resolvedSelectedShockerId = ownedShockerIds.has(storedSelectedShockerId) ? storedSelectedShockerId : '';
      const settings = {
        username: creds.username || '',
        sharecode: creds.sharecode || '',
        selectedShockerId: resolvedSelectedShockerId,
        selectedShockerName: creds.selectedShockerName || '',
        availableShockers,
        allowedShockerIds: (Array.isArray(creds.allowedShockerIds) ? creds.allowedShockerIds.map(String) : [])
          .filter((id) => ownedShockerIds.has(id)),
        hasGeneratedShareCodeForSelected: resolvedSelectedShockerId ? Boolean(generatedShareCodes[resolvedSelectedShockerId]) : false,
        generatedShareCodeCount: Object.keys(generatedShareCodes).length,
        allowOverLimitWithConsumable: Boolean(creds.allowOverLimitWithConsumable),
        usingLegacySharecodeFallback,
        hasOwnDevice: true,
        maxIntensity: Number(creds.maxIntensity) || 100,
        maxDuration: Number(creds.maxDuration) || 15,
        lastUpdated: userData.lastUpdated,
        piShockUserId: resolvedPiShockUserId,
        bannedExecutors: userData.bannedExecutors || [],
        commandsPaused: Boolean(userData.commandsPaused),
        shockerIdsHiddenNotOnDevices,
      };

      if (resolvedPiShockUserId && resolvedPiShockUserId !== creds.piShockUserId) {
        const updatedCreds = { ...creds, piShockUserId: resolvedPiShockUserId };
        await store.putUserData(userId, {
          ...userData,
          credentials: store.encryptCredentials(updatedCreds),
          piShockUserId: resolvedPiShockUserId,
        });
      }

      return jsonResponse(c, {
        hasSettings: true,
        settings,
        bannedExecutors: userData.bannedExecutors || [],
        deprecations: usingLegacySharecodeFallback ? ['Share code configuration is deprecated. Please select a shocker from your account.'] : [],
      });
    } catch {
      return jsonResponse(c, { hasSettings: false, settings: null, bannedExecutors: [] });
    }
  });

  app.put('/:userId/pishock-settings', async (c) => {
    const userId = c.req.param('userId');
    const auth = await authUser(c, store, env);
    if ('error' in auth) return jsonResponse(c, auth.error, auth.status);
    if (auth.user.id !== userId) return jsonResponse(c, 'Forbidden', 403);

    const body = await c.req.json<Record<string, unknown>>();
    const existingUserData = await store.getUserData(userId);
    const isExistingUser = !!existingUserData?.credentials;
    const hasBannedExecutorsField = Object.prototype.hasOwnProperty.call(body, 'bannedExecutors');

    const isBanListOnlyUpdate = !body.apiKey && !body.username && !body.sharecode && !body.selectedShockerId &&
      hasBannedExecutorsField && Array.isArray(body.bannedExecutors) && isExistingUser;
    const isPauseOnlyUpdate = !body.apiKey && !body.username && !body.sharecode && !body.selectedShockerId &&
      typeof body.commandsPaused === 'boolean' && isExistingUser;

    if (isBanListOnlyUpdate || isPauseOnlyUpdate) {
      await store.putUserData(userId, {
        ...existingUserData!,
        bannedExecutors: hasBannedExecutorsField ? (body.bannedExecutors as string[]) : existingUserData?.bannedExecutors,
        commandsPaused: typeof body.commandsPaused === 'boolean' ? body.commandsPaused : existingUserData?.commandsPaused,
      });
      await store.clearUserStatusCache(userId);
      const updated = await store.getUserData(userId);
      return jsonResponse(c, {
        success: true,
        banListUpdated: isBanListOnlyUpdate,
        pauseUpdated: isPauseOnlyUpdate,
        bannedExecutors: updated?.bannedExecutors || [],
        commandsPaused: Boolean(updated?.commandsPaused),
      });
    }

    const { apiKey, username, sharecode, selectedShockerId, refreshShockersOnly, allowedShockerIds, allowOverLimitWithConsumable, commandsPaused, disableLegacySharecode, maxIntensity = 100, maxDuration = 15 } = body;

    if (refreshShockersOnly) {
      if (!username) return jsonResponse(c, { success: false, error: 'Username is required to refresh owned shockers.' }, 400);
      let finalApiKey = apiKey as string | undefined;
      if (!finalApiKey && existingUserData?.credentials) {
        finalApiKey = String(store.decryptCredentials(existingUserData.credentials).apiKey);
      }
      if (!finalApiKey) return jsonResponse(c, { success: false, error: 'API Key required' }, 400);
      const validation = await validatePiShockCredentials(finalApiKey, String(username));
      if (!validation.valid) return jsonResponse(c, { success: false, error: validation.error }, 400);
      const deviceCheck = await checkUserDevices(finalApiKey, String(username), validation.userId);
      const availableShockers = mapShockersToOptions(deviceCheck.devices || []);
      return jsonResponse(c, {
        success: true,
        isConnected: true,
        refreshOnly: true,
        availableShockers,
        selectedShockerId: selectedShockerId || null,
        allowedShockerIds: Array.isArray(allowedShockerIds) ? allowedShockerIds : [],
        piShockUserId: validation.userId,
        deviceCount: deviceCheck.devices?.length || 0,
      });
    }

    if (!username || !selectedShockerId) {
      return jsonResponse(c, { success: false, error: 'Username and Selected Shocker are required.' }, 400);
    }

    let finalApiKey = apiKey as string | undefined;
    if (!finalApiKey && existingUserData?.credentials) {
      finalApiKey = String(store.decryptCredentials(existingUserData.credentials).apiKey);
    }
    if (!finalApiKey) return jsonResponse(c, { success: false, error: 'API Key is required' }, 400);

    const credentialValidation = await validatePiShockCredentials(finalApiKey, String(username));
    if (!credentialValidation.valid) {
      return jsonResponse(c, { success: false, isConnected: false, error: credentialValidation.error }, 400);
    }

    const deviceCheck = await checkUserDevices(finalApiKey, String(username), credentialValidation.userId);
    const availableShockers = mapShockersToOptions(deviceCheck.devices || []);
    const finalSelectedShockerId = String(selectedShockerId);
    const selected = availableShockers.find((s) => s.id === finalSelectedShockerId);
    if (!selected) {
      return jsonResponse(c, { success: false, error: 'Selected shocker is not available for this account.' }, 400);
    }

    const normalizedAllowed = (Array.isArray(allowedShockerIds) ? allowedShockerIds : []).map(String)
      .filter((id) => availableShockers.some((s) => s.id === id));
    if (!normalizedAllowed.includes(finalSelectedShockerId)) normalizedAllowed.push(finalSelectedShockerId);

    let existingGeneratedShareCodes: Record<string, string> = {};
    if (existingUserData?.credentials) {
      existingGeneratedShareCodes = normalizeGeneratedShareCodes(store.decryptCredentials(existingUserData.credentials).generatedShareCodes);
    }

    const generationTargets = availableShockers.map((s) => s.id);
    const generatedShareCodesResult = generationTargets.length > 0
      ? await generateLegacyShareCodesForOwnedShockers({ apiKey: finalApiKey, username: String(username), piShockUserId: credentialValidation.userId }, generationTargets)
      : { ok: true, data: {} as Record<string, string> };
    const mergedGeneratedShareCodes = {
      ...existingGeneratedShareCodes,
      ...(generatedShareCodesResult.data ? normalizeGeneratedShareCodes(generatedShareCodesResult.data) : {}),
    };

    const credentialsToStore = {
      apiKey: finalApiKey,
      username,
      sharecode: disableLegacySharecode ? '' : (sharecode || ''),
      selectedShockerId: finalSelectedShockerId,
      selectedShockerName: selected.name,
      allowedShockerIds: normalizedAllowed,
      allowOverLimitWithConsumable: Boolean(allowOverLimitWithConsumable),
      generatedShareCodes: mergedGeneratedShareCodes,
      hasOwnDevice: true,
      piShockUserId: credentialValidation.userId,
      shockerId: finalSelectedShockerId,
      deviceCount: deviceCheck.devices?.length || 0,
      maxIntensity: Number(maxIntensity),
      maxDuration: Number(maxDuration),
      lastValidated: new Date().toISOString(),
    };

    await store.putUserData(userId, {
      credentials: store.encryptCredentials(credentialsToStore),
      lastTested: new Date().toISOString(),
      configuredBy: String(auth.user.id),
      maxIntensity: Number(maxIntensity),
      maxDuration: Number(maxDuration),
      hasOwnDevice: true,
      piShockUserId: credentialValidation.userId,
      shockerId: finalSelectedShockerId,
      deviceCount: deviceCheck.devices?.length || 0,
      bannedExecutors: Array.isArray(body.bannedExecutors) ? body.bannedExecutors as string[] : existingUserData?.bannedExecutors,
      commandsPaused: typeof commandsPaused === 'boolean' ? commandsPaused : Boolean(existingUserData?.commandsPaused),
    });
    await store.clearUserStatusCache(userId);

    return jsonResponse(c, {
      success: true,
      isConnected: true,
      hasOwnDevice: true,
      deviceCount: deviceCheck.devices?.length || 0,
      piShockUserId: credentialValidation.userId,
      selectedShockerId: finalSelectedShockerId,
      shockerId: finalSelectedShockerId,
      selectedShockerName: selected.name,
      allowedShockerIds: normalizedAllowed,
      allowOverLimitWithConsumable: Boolean(allowOverLimitWithConsumable),
      commandsPaused: typeof commandsPaused === 'boolean' ? commandsPaused : Boolean(existingUserData?.commandsPaused),
    });
  });

  app.delete('/:userId/pishock-settings', async (c) => {
    const userId = c.req.param('userId');
    const auth = await authUser(c, store, env);
    if ('error' in auth) return jsonResponse(c, auth.error, auth.status);
    if (auth.user.id !== userId) return jsonResponse(c, 'Forbidden', 403);
    await store.deleteUserData(userId);
    return jsonResponse(c, { success: true });
  });

  app.get('/:userId/pishock-status', async (c) => {
    const userId = c.req.param('userId');
    const auth = await authUser(c, store, env);
    if ('error' in auth) return jsonResponse(c, auth.error, auth.status);

    const cached = await store.getUserStatusCache(userId);
    if (cached?.status) {
      return jsonResponse(c, cached.status, 200, { 'X-Cache-Status': 'HIT' });
    }

    const userData = await store.getUserData(userId);
    let result: Record<string, unknown> = {
      hasCredentials: !!userData?.credentials,
      isConnected: false,
      hasDevice: false,
      deviceCount: 0,
      hasOwnDevice: userData?.hasOwnDevice || false,
      piShockUserId: userData?.piShockUserId,
      selectedShockerId: null,
      selectedShockerName: null,
      allowedShockerIds: [],
      hasGeneratedShareCodeForSelected: false,
      generatedShareCodeCount: 0,
      allowOverLimitWithConsumable: false,
      commandsPaused: Boolean(userData?.commandsPaused),
      canShock: true,
      canVibrate: true,
      canBeep: true,
      canPause: false,
      usingLegacySharecodeFallback: false,
      lastTested: userData?.lastTested,
      isRelay: false,
      maxIntensity: 100,
      maxDuration: 15,
      shockerIdsHiddenNotOnDevices: 0,
      deprecations: [],
    };

    if (userData?.credentials) {
      try {
        const creds = store.decryptCredentials(userData.credentials);
        result.maxIntensity = Number(creds.maxIntensity) || 100;
        result.maxDuration = Number(creds.maxDuration) || 15;
        result.selectedShockerId = creds.selectedShockerId || creds.shockerId || null;
        result.selectedShockerName = creds.selectedShockerName || null;
        result.usingLegacySharecodeFallback = Boolean(creds.sharecode && !creds.selectedShockerId);
        const generatedShareCodes = normalizeGeneratedShareCodes(creds.generatedShareCodes);
        result.generatedShareCodeCount = Object.keys(generatedShareCodes).length;
        result.hasGeneratedShareCodeForSelected = Boolean(getGeneratedShareCodeForShocker(generatedShareCodes, String(result.selectedShockerId)));
        result.allowedShockerIds = Array.isArray(creds.allowedShockerIds) ? creds.allowedShockerIds : [];
        result.allowOverLimitWithConsumable = Boolean(creds.allowOverLimitWithConsumable);

        const validation = await validatePiShockCredentials(String(creds.apiKey), String(creds.username));
        result.isConnected = validation.valid;
        if (validation.valid && validation.userId) {
          const deviceCheck = await checkUserDevices(String(creds.apiKey), String(creds.username), validation.userId);
          result.hasDevice = deviceCheck.hasDevices;
          result.deviceCount = deviceCheck.devices?.length || 0;
          result.shockerIdsHiddenNotOnDevices = deviceCheck.shockerIdsHiddenNotOnDevices ?? 0;
        }
      } catch {
        result.isConnected = false;
      }
    }

    await store.setUserStatusCache(userId, result);
    return jsonResponse(c, result);
  });

  app.post('/:userId/pishock-test', async (c) => {
    const userId = c.req.param('userId');
    const auth = await authUser(c, store, env);
    if ('error' in auth) return jsonResponse(c, auth.error, auth.status);
    if (auth.user.id !== userId) return jsonResponse(c, 'Forbidden', 403);

    const userData = await store.getUserData(userId);
    if (!userData?.credentials) {
      return jsonResponse(c, { success: false, isConnected: false, error: 'No credentials stored for this user' });
    }

    const creds = store.decryptCredentials(userData.credentials);
    const credentialValidation = await validatePiShockCredentials(String(creds.apiKey), String(creds.username));
    if (!credentialValidation.valid) {
      return jsonResponse(c, { success: false, isConnected: false, error: credentialValidation.error });
    }

    const deviceCheck = await checkUserDevices(String(creds.apiKey), String(creds.username), credentialValidation.userId);
    const selectedShockerId = String(creds.selectedShockerId || creds.shockerId || '');
    const selectedShareCode = getGeneratedShareCodeForShocker(creds.generatedShareCodes, selectedShockerId);
    const credentials = { apiKey: String(creds.apiKey), username: String(creds.username), piShockUserId: credentialValidation.userId };
    const testResult = selectedShareCode
      ? await operatePiShockShareCode(credentials, selectedShareCode, { operation: 2, intensity: 1, durationSeconds: 1, agentName: 'DiscordActivityConnectionTest' })
      : await operatePiShockShocker(credentials, selectedShockerId, { operation: 2, intensity: 1, durationSeconds: 1, agentName: 'DiscordActivityConnectionTest' });

    await store.putUserData(userId, { ...userData, lastTested: new Date().toISOString(), piShockUserId: credentialValidation.userId });

    return jsonResponse(c, {
      success: testResult.ok,
      isConnected: testResult.ok,
      hasDevice: deviceCheck.hasDevices,
      deviceCount: deviceCheck.devices?.length || 0,
      piShockUserId: credentialValidation.userId,
      selectedShockerId,
      error: testResult.ok ? undefined : testResult.error,
    });
  });

  app.post('/:userId/pishock-execute', async (c) => {
    const targetUserId = c.req.param('userId');
    const auth = await authUser(c, store, env);
    if ('error' in auth) return jsonResponse(c, auth.error, auth.status);

    const { executorUserId, intensity, duration, operation } = await c.req.json<{
      executorUserId: string;
      intensity: number;
      duration: number;
      operation: number;
    }>();

    if (!executorUserId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse(c, { success: false, error: 'Invalid parameters' }, 400);
    }
    if (auth.user.id !== executorUserId) {
      return jsonResponse(c, { success: false, error: 'Executor mismatch for authenticated user.' }, 403);
    }

    const targetUserData = await store.getUserData(targetUserId);
    if (targetUserData?.commandsPaused) {
      return jsonResponse(c, { success: false, error: 'This user has paused all incoming commands.', paused: true, targetUserId }, 423);
    }
    if (targetUserData?.bannedExecutors?.includes(executorUserId)) {
      return jsonResponse(c, { success: false, error: 'Executor is banned by target user.', banned: true }, 403);
    }
    if (!targetUserData?.credentials) {
      return jsonResponse(c, { success: false, error: `Target user (${targetUserId}) has no PiShock device configured.` });
    }

    const creds = store.decryptCredentials(targetUserData.credentials);
    const operationNames = ['shock', 'vibrate', 'beep'];
    const selectedShockerId = String(creds.selectedShockerId || creds.shockerId || '');
    if (!selectedShockerId) return jsonResponse(c, { success: false, error: 'No selected shocker configured.' });

    const pishockCredentials = { apiKey: String(creds.apiKey), username: String(creds.username), piShockUserId: String(creds.piShockUserId || '') };
    const selectedShareCode = getGeneratedShareCodeForShocker(creds.generatedShareCodes, selectedShockerId) || '';
    const effectiveMaxIntensity = Number(creds.maxIntensity) || 100;
    const effectiveMaxDuration = Number(creds.maxDuration) || 15;
    const overLimitAttempt = intensity > effectiveMaxIntensity || duration > effectiveMaxDuration;

    let pendingOverlimitEntitlementId: string | undefined;
    if (overLimitAttempt) {
      if (!creds.allowOverLimitWithConsumable) {
        return jsonResponse(c, { success: false, error: `Command exceeds target limits (${effectiveMaxIntensity}% / ${effectiveMaxDuration}s) and over-limit consent is disabled.` });
      }
      const entitlementState = await getControllerPlusState(env, executorUserId);
      if (!entitlementState.overlimitEntitlementId) {
        return jsonResponse(c, { success: false, error: 'Over-limit command requires an available consumable entitlement.' }, 403);
      }
      pendingOverlimitEntitlementId = entitlementState.overlimitEntitlementId;
    }

    const operateResult = selectedShareCode
      ? await operatePiShockShareCode(pishockCredentials, selectedShareCode, { operation, intensity, durationSeconds: duration, agentName: 'DiscordActivity' })
      : await operatePiShockShocker(pishockCredentials, selectedShockerId, { operation, intensity, durationSeconds: duration, agentName: 'DiscordActivity' });

    if (!operateResult.ok) {
      return jsonResponse(c, { success: false, error: operateResult.error || 'PiShock operation failed.' });
    }

    if (overLimitAttempt && pendingOverlimitEntitlementId) {
      await consumeOverlimitEntitlement(env, pendingOverlimitEntitlementId);
    }

    const logEntryId = uuidv4();
    const executorProfile = await store.getDiscordUser(executorUserId);
    const targetProfile = await store.getDiscordUser(targetUserId);
    void store.addActivityLogEntry({
      id: logEntryId,
      timestamp: new Date().toISOString(),
      instanceId: 'global',
      executorUserId,
      executorUsername: String(executorProfile?.global_name || executorProfile?.username || 'Unknown User'),
      targetUserId,
      targetUsername: String(targetProfile?.global_name || targetProfile?.username || 'Unknown User'),
      action: operationNames[operation] as 'shock' | 'vibrate' | 'beep',
      intensity,
      duration,
    });

    return jsonResponse(c, {
      success: true,
      logEntryId,
      message: `${operationNames[operation]} command executed successfully`,
      selectedShockerId,
      overLimitUsed: overLimitAttempt,
      effectiveMaxIntensity,
      effectiveMaxDuration,
      hasGeneratedShareCodeForSelected: Boolean(selectedShareCode),
      usedDirectShockerFallback: !selectedShareCode,
    });
  });

  return app;
}
