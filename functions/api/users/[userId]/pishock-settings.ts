import {
  getPiShockAccount,
  generateLegacyShareCodesForOwnedShockers,
  getGeneratedShareCodeForShocker,
  getAllowedShockersForController,
  mapShockersToOptions,
  normalizeGeneratedShareCodes,
} from '../../_shared/pishock-client';

interface Env {
  PISHOCK_KV: KVNamespace;
}

interface PagesFunction<Env = unknown> {
  (context: { request: Request; env: Env; params: Record<string, string>; waitUntil: (promise: Promise<any>) => void; passThroughOnException: () => void; }): Promise<Response> | Response;
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Vary': 'Authorization',
    },
  });
}

async function requireAuth(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

async function validateDiscordToken(token: string, kv: KVNamespace): Promise<any> {
  try {
    const cacheKey = `discord_token_validation:${token.slice(-8)}`; // Use last 8 chars to avoid storing full token
    const cached = await kv.get(cacheKey);
    if (cached) {
      const cachedData = JSON.parse(cached);
      return cachedData;
    }
    
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error('Invalid Discord token');
    }
    
    const userData = await response.json();
    
    // Try to get expiry info from metadata
    let expiresAt = 0;
    let cacheTtl = 10800; // Default 3 hours if no metadata
    const metadataStr = await kv.get(`discord_token_metadata:${userData.id}`);
    if (metadataStr) {
      const metadata = JSON.parse(metadataStr);
      expiresAt = metadata.expires_at;
      // Use remaining token lifetime for cache TTL
      const now = Math.floor(Date.now() / 1000);
      const remainingTime = expiresAt - now;
      cacheTtl = Math.max(60, remainingTime - 60); // At least 1 minute
    }
    
    await kv.put(cacheKey, JSON.stringify({
      ...userData,
      token_expires_at: expiresAt
    }), {
      expirationTtl: cacheTtl // Match token expiry
    });
    
    return userData;
  } catch (error) {
    return null;
  }
}

async function encrypt(data: any): Promise<string> {
  return btoa(JSON.stringify(data));
}

async function decrypt(data: string): Promise<any> {
  return JSON.parse(atob(data));
}

async function validatePiShockCredentials(apiKey: string, username: string): Promise<{ valid: boolean; userId?: string; error?: string; debugInfo?: any }> {
  const accountResult = await getPiShockAccount({ apiKey, username });
  if (!accountResult.ok) {
    return {
      valid: false,
      error: accountResult.error || 'Credential validation failed',
      debugInfo: { status: accountResult.status, rawBody: accountResult.rawBody },
    };
  }

  const userId = accountResult.data?.UserId;
  if (userId === undefined || userId === null) {
    return {
      valid: false,
      error: 'No UserID found in API response',
      debugInfo: { account: accountResult.data },
    };
  }

  return {
    valid: true,
    userId: String(userId),
    debugInfo: { account: accountResult.data },
  };
}

async function checkUserDevices(apiKey: string, username: string, piShockUserId?: string): Promise<{
  hasDevices: boolean;
  devices?: any[];
  error?: string;
  debugInfo?: any;
  shockerIdsHiddenNotOnDevices?: number;
}> {
  const allowed = await getAllowedShockersForController({ apiKey, username, piShockUserId });
  if (!allowed.ok || !allowed.data) {
    console.log(
      `[PiShock:pishock-settings:checkUserDevices] failed username=${String(username || '').trim() || '(empty)'} ` +
        `status=${allowed.status} error=${(allowed.error || '').slice(0, 300)}`
    );
    return {
      hasDevices: false,
      error: allowed.error || 'Device check failed',
      debugInfo: { status: allowed.status, rawBody: allowed.rawBody },
    };
  }

  const devices = (allowed.data.activeOwnedShockers && allowed.data.activeOwnedShockers.length > 0)
    ? allowed.data.activeOwnedShockers
    : allowed.data.allowedShockers;
  if (devices.length === 0) {
    console.log(
      `[PiShock:pishock-settings:checkUserDevices] zero allowed shockers username=${String(username || '').trim() || '(empty)'} ` +
        `hiddenNotOnDevices=${allowed.data.shockerIdsHiddenNotOnDevices}`
    );
  }
  return {
    hasDevices: devices.length > 0,
    devices,
    shockerIdsHiddenNotOnDevices: allowed.data.shockerIdsHiddenNotOnDevices,
    debugInfo: {
      deviceCount: devices.length,
      shockerIdsHiddenNotOnDevices: allowed.data.shockerIdsHiddenNotOnDevices,
    },
  };
}

function hasSettingsChanged(existing: any, newData: any): boolean {
  if (!existing) return true;
  
  const existingCreds = existing.credentials ? JSON.parse(atob(existing.credentials)) : {};
  const newCreds = newData.credentials ? JSON.parse(atob(newData.credentials)) : {};
  
  return existing.maxIntensity !== newData.maxIntensity ||
         existing.maxDuration !== newData.maxDuration ||
         JSON.stringify(existing.bannedExecutors || []) !== JSON.stringify(newData.bannedExecutors || []) ||
         existingCreds.username !== newCreds.username ||
         existingCreds.sharecode !== newCreds.sharecode ||
         existingCreds.selectedShareCode !== newCreds.selectedShareCode ||
         existingCreds.selectedShockerId !== newCreds.selectedShockerId ||
         JSON.stringify(normalizeGeneratedShareCodes(existingCreds.generatedShareCodes)) !== JSON.stringify(normalizeGeneratedShareCodes(newCreds.generatedShareCodes)) ||
         JSON.stringify(existingCreds.allowedShockerIds || []) !== JSON.stringify(newCreds.allowedShockerIds || []) ||
         Boolean(existingCreds.allowOverLimitWithConsumable) !== Boolean(newCreds.allowOverLimitWithConsumable);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const method = request.method;
  const userId = params.userId as string;

  // Handle CORS preflight requests
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });

  // Users can only manage their own PiShock settings
  if (user.id !== userId) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    if (method === 'GET') {
      const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
      const userData = userDataStr ? JSON.parse(userDataStr) : null;
      
      if (!userData?.credentials) {
        return jsonResponse({ 
          hasSettings: false,
          settings: null,
          bannedExecutors: []
        });
      }

      try {
        const creds = await decrypt(userData.credentials);
        
        let availableShockers: any[] = [];
        let shockerIdsHiddenNotOnDevices = 0;
        let resolvedPiShockUserId = creds.piShockUserId;
        if (creds.apiKey && creds.username) {
          const validation = await validatePiShockCredentials(creds.apiKey, creds.username);
          if (validation.valid && validation.userId) {
            resolvedPiShockUserId = validation.userId;
          }
          const allowedResult = await getAllowedShockersForController({
            apiKey: creds.apiKey,
            username: creds.username,
            piShockUserId: resolvedPiShockUserId,
          });
          if (allowedResult.ok && allowedResult.data) {
            availableShockers = mapShockersToOptions(allowedResult.data.allowedShockers);
            shockerIdsHiddenNotOnDevices = allowedResult.data.shockerIdsHiddenNotOnDevices;
          }
        }
        const ownedShockerIds = new Set(availableShockers.map((shocker) => String(shocker.id)));

        const usingLegacySharecodeFallback = Boolean(creds.sharecode && !creds.selectedShockerId);
        const generatedShareCodes = normalizeGeneratedShareCodes(creds.generatedShareCodes);
        const storedSelectedShockerId = creds.selectedShockerId || creds.shockerId || '';
        const resolvedSelectedShockerId = ownedShockerIds.has(String(storedSelectedShockerId))
          ? String(storedSelectedShockerId)
          : '';
        const selectedShockerShareCode = getGeneratedShareCodeForShocker(generatedShareCodes, resolvedSelectedShockerId);
        const explicitSelectedShareCode = typeof creds.selectedShareCode === 'string'
          ? creds.selectedShareCode.trim()
          : '';
        const effectiveSelectedShareCode = explicitSelectedShareCode || selectedShockerShareCode || '';
        const persistedAllowed = Array.isArray(creds.allowedShockerIds) ? creds.allowedShockerIds.map((id: any) => String(id)) : [];
        const filteredAllowed = persistedAllowed.filter((id) => ownedShockerIds.has(id));
        const allowedShockerIds = resolvedSelectedShockerId && !filteredAllowed.includes(resolvedSelectedShockerId)
          ? [...filteredAllowed, resolvedSelectedShockerId]
          : filteredAllowed;
        const settings = {
          username: creds.username || '',
          sharecode: creds.sharecode || '',
          selectedShockerId: resolvedSelectedShockerId,
          selectedShockerName: creds.selectedShockerName || '',
          selectedShareCode: effectiveSelectedShareCode,
          availableShareCodesForSelected: effectiveSelectedShareCode ? [effectiveSelectedShareCode] : [],
          availableShockers,
          allowedShockerIds,
          hasGeneratedShareCodeForSelected: Boolean(selectedShockerShareCode),
          generatedShareCodeCount: Object.keys(generatedShareCodes).length,
          allowOverLimitWithConsumable: Boolean(creds.allowOverLimitWithConsumable),
          usingLegacySharecodeFallback,
          hasOwnDevice: true,
          maxIntensity: creds.maxIntensity || 100,
          maxDuration: creds.maxDuration || 15,
          lastUpdated: userData.lastUpdated,
          piShockUserId: resolvedPiShockUserId,
          bannedExecutors: userData.bannedExecutors || [],
          commandsPaused: Boolean(userData.commandsPaused),
          shockerIdsHiddenNotOnDevices,
        };

        if (resolvedPiShockUserId && resolvedPiShockUserId !== creds.piShockUserId) {
          const updatedCreds = {
            ...creds,
            piShockUserId: resolvedPiShockUserId,
          };
          userData.credentials = await encrypt(updatedCreds);
          userData.piShockUserId = resolvedPiShockUserId;
          userData.lastUpdated = new Date().toISOString();
          await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
        }
        
        return jsonResponse({ 
          hasSettings: true,
          settings,
          bannedExecutors: userData.bannedExecutors || [],
          deprecations: usingLegacySharecodeFallback ? [
            'Share code configuration is deprecated. Please select a shocker from your account.'
          ] : resolvedSelectedShockerId && !selectedShockerShareCode ? [
            'Selected shocker has no generated sharecode yet. Re-save settings to regenerate bridge sharecodes.'
          ] : []
        });
      } catch (error) {
        console.error('Failed to decrypt user settings:', error);
        return jsonResponse({ 
          hasSettings: false,
          settings: null,
          bannedExecutors: []
        });
      }
    }

    if (method === 'PUT') {
      const body = await request.json();
      const {
        apiKey,
        username,
        sharecode,
        selectedShockerId,
        selectedShareCode,
        createShareCodeForSelected = false,
        refreshShockersOnly = false,
        allowedShockerIds = [],
        allowOverLimitWithConsumable = false,
        commandsPaused,
        disableLegacySharecode = false,
        hasOwnDevice,
        maxIntensity = 100,
        maxDuration = 15,
      } = body;
      const hasBannedExecutorsField = Object.prototype.hasOwnProperty.call(body, 'bannedExecutors');

      const existingUserDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
      const existingUserData = existingUserDataStr ? JSON.parse(existingUserDataStr) : null;
      const isExistingUser = !!existingUserData?.credentials;
      const isShockerRefreshOnly = Boolean(refreshShockersOnly);
      
      const isBanListOnlyUpdate = !apiKey && !username && !sharecode && !selectedShockerId &&
                                 hasBannedExecutorsField &&
                                 Array.isArray(body.bannedExecutors) &&
                                 isExistingUser;
      const isPauseOnlyUpdate = !apiKey && !username && !sharecode && !selectedShockerId &&
                                typeof commandsPaused === 'boolean' &&
                                isExistingUser;
      
      if (isBanListOnlyUpdate || isPauseOnlyUpdate) {
        const nextBanned = hasBannedExecutorsField
          ? (Array.isArray(body.bannedExecutors)
              ? body.bannedExecutors
              : Array.isArray(existingUserData?.bannedExecutors)
                ? existingUserData.bannedExecutors
                : [])
          : (Array.isArray(existingUserData?.bannedExecutors) ? existingUserData.bannedExecutors : []);
        const updatedUserData = {
          ...existingUserData,
          bannedExecutors: nextBanned,
          commandsPaused: typeof commandsPaused === 'boolean'
            ? commandsPaused
            : Boolean(existingUserData?.commandsPaused),
          lastUpdated: new Date().toISOString()
        };
        
        await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(updatedUserData));
        await Promise.allSettled([
          env.PISHOCK_KV.delete(`cache:user_status:${userId}`),
          env.PISHOCK_KV.delete(`user_status_cache:${userId}`),
        ]);
        
        return jsonResponse({ 
          success: true,
          banListUpdated: isBanListOnlyUpdate,
          pauseUpdated: isPauseOnlyUpdate,
          bannedExecutors: updatedUserData.bannedExecutors,
          commandsPaused: Boolean(updatedUserData.commandsPaused),
        });
      } else {
        if (isShockerRefreshOnly) {
          if (!username) {
            return jsonResponse({
              success: false,
              error: 'Username is required to refresh owned shockers.'
            }, 400);
          }
          if (!isExistingUser && !apiKey) {
            return jsonResponse({
              success: false,
              error: 'API Key and Username are required to refresh owned shockers for new accounts.'
            }, 400);
          }
        } else {
          if (!isExistingUser && (!apiKey || !username || (!selectedShockerId && !sharecode))) {
            return jsonResponse({ 
              success: false, 
              error: 'Missing required fields: API Key, Username, and Selected Shocker are required.' 
            }, 400);
          }
          
          if (!username || !selectedShockerId) {
            return jsonResponse({ 
              success: false, 
              error: 'Username and Selected Shocker are required.' 
            }, 400);
          }
        }
      }
      
      let finalApiKey = apiKey;
      if (!apiKey && isExistingUser) {
        try {
          const existingCreds = await decrypt(existingUserData.credentials);
          finalApiKey = existingCreds.apiKey;
        } catch (error) {
          return jsonResponse({ 
            success: false, 
            error: 'Failed to preserve existing API key. Please provide your API key.' 
          }, 500);
        }
      }
      
      if (!finalApiKey) {
        return jsonResponse({ 
          success: false, 
          error: 'API Key is required for new accounts or when existing credentials cannot be retrieved' 
        }, 400);
      }

      if (maxIntensity < 1 || maxIntensity > 100) {
        return jsonResponse({ 
          success: false, 
          error: 'Max intensity must be between 1 and 100' 
        }, 400);
      }

      if (maxDuration < 1 || maxDuration > 15) {
        return jsonResponse({ 
          success: false, 
          error: 'Max duration must be between 1 and 15 seconds' 
        }, 400);
      }

      const credentialValidation = await validatePiShockCredentials(finalApiKey, username);
      
      if (!credentialValidation.valid) {
        return jsonResponse({ 
          success: false, 
          isConnected: false, 
          error: credentialValidation.error || 'Invalid PiShock credentials. Please check your API key and username.',
          debug: {
            step: 'credential_validation',
            ...credentialValidation.debugInfo
          }
        });
      }

      const piShockUserId = credentialValidation.userId!;
      
      const deviceCheck = await checkUserDevices(finalApiKey, username, piShockUserId);
      const availableShockers = mapShockersToOptions(deviceCheck.devices || []);
      let finalSelectedShockerId = selectedShockerId || '';
      let selectedShockerName = '';

      if (finalSelectedShockerId) {
        const selected = availableShockers.find((shocker) => shocker.id === String(finalSelectedShockerId));
        if (!selected) {
          return jsonResponse({
            success: false,
            isConnected: false,
            error: 'Selected shocker is not available for this account.',
            debug: {
              step: 'selected_shocker_validation',
              selectedShockerId: finalSelectedShockerId,
              availableShockers,
            }
          }, 400);
        }
        selectedShockerName = selected.name;
      }

      const normalizedAllowedShockerIds = (Array.isArray(allowedShockerIds) ? allowedShockerIds : [])
        .map((id) => String(id))
        .filter((id) => availableShockers.some((shocker) => shocker.id === id));
      if (finalSelectedShockerId && !normalizedAllowedShockerIds.includes(finalSelectedShockerId)) {
        normalizedAllowedShockerIds.push(finalSelectedShockerId);
      }

      if (isShockerRefreshOnly) {
        const existingSelectedShareCode = isExistingUser && existingUserData?.credentials
          ? (() => {
              try {
                const existingCreds = JSON.parse(atob(existingUserData.credentials));
                return typeof existingCreds.selectedShareCode === 'string'
                  ? existingCreds.selectedShareCode.trim()
                  : '';
              } catch {
                return '';
              }
            })()
          : '';
        return jsonResponse({
          success: true,
          isConnected: true,
          refreshOnly: true,
          availableShockers,
          selectedShockerId: finalSelectedShockerId || null,
          selectedShareCode: existingSelectedShareCode,
          availableShareCodesForSelected: existingSelectedShareCode ? [existingSelectedShareCode] : [],
          allowedShockerIds: normalizedAllowedShockerIds,
          piShockUserId,
          deviceCount: deviceCheck.devices?.length || 0,
        });
      }
      let existingGeneratedShareCodes: Record<string, string> = {};
      let existingSelectedShareCode = '';
      if (isExistingUser && existingUserData?.credentials) {
        try {
          const existingCreds = await decrypt(existingUserData.credentials);
          existingGeneratedShareCodes = normalizeGeneratedShareCodes(existingCreds.generatedShareCodes);
          existingSelectedShareCode = typeof existingCreds.selectedShareCode === 'string'
            ? existingCreds.selectedShareCode.trim()
            : '';
        } catch {
          existingGeneratedShareCodes = {};
          existingSelectedShareCode = '';
        }
      }

      const generationTargets = createShareCodeForSelected
        ? (finalSelectedShockerId ? [String(finalSelectedShockerId)] : [])
        : availableShockers.map((shocker) => String(shocker.id));
      const shouldGenerateCodes = generationTargets.length > 0;
      const generatedShareCodesResult = shouldGenerateCodes
        ? await generateLegacyShareCodesForOwnedShockers(
            {
              apiKey: finalApiKey,
              username,
              piShockUserId,
            },
            generationTargets
          )
        : { ok: true, status: 200, data: {} as Record<string, string> };
      const mergedGeneratedShareCodes = {
        ...existingGeneratedShareCodes,
        ...(generatedShareCodesResult.data
          ? normalizeGeneratedShareCodes(generatedShareCodesResult.data)
          : {}),
      };
      const shareCodeGenerationFailed = shouldGenerateCodes && !generatedShareCodesResult.ok;
      const requestedSelectedShareCode = typeof selectedShareCode === 'string' ? selectedShareCode.trim() : '';
      const selectedShareCodeFromMap = getGeneratedShareCodeForShocker(mergedGeneratedShareCodes, finalSelectedShockerId);
      const finalSelectedShareCode = requestedSelectedShareCode
        || selectedShareCodeFromMap
        || existingSelectedShareCode;
      if (finalSelectedShockerId && finalSelectedShareCode) {
        mergedGeneratedShareCodes[String(finalSelectedShockerId)] = finalSelectedShareCode;
      }
      if (finalSelectedShockerId && !finalSelectedShareCode) {
        return jsonResponse({
          success: false,
          isConnected: false,
          error:
            generatedShareCodesResult.error ||
            'Unable to generate a sharecode for the selected shocker.',
          debug: {
            step: 'selected_shocker_share_code',
            selectedShockerId: finalSelectedShockerId,
            generatedShareCodeCount: Object.keys(mergedGeneratedShareCodes).length,
          },
        }, 502);
      }

      if (createShareCodeForSelected) {
        const existingCreds = isExistingUser && existingUserData?.credentials
          ? await decrypt(existingUserData.credentials)
          : {};
        const credentialsToStore = {
          ...existingCreds,
          apiKey: finalApiKey,
          username,
          sharecode: disableLegacySharecode ? '' : (existingCreds.sharecode || ''),
          selectedShockerId: finalSelectedShockerId || null,
          selectedShockerName: selectedShockerName || null,
          selectedShareCode: finalSelectedShareCode,
          allowedShockerIds: normalizedAllowedShockerIds,
          allowOverLimitWithConsumable: Boolean(allowOverLimitWithConsumable),
          generatedShareCodes: mergedGeneratedShareCodes,
          generatedShareCodeGenerationFailed: shareCodeGenerationFailed,
          generatedShareCodesLastUpdated: new Date().toISOString(),
          hasOwnDevice: deviceCheck.hasDevices,
          piShockUserId,
          shockerId: finalSelectedShockerId,
          deviceCount: deviceCheck.devices?.length || 0,
          lastValidated: new Date().toISOString(),
          maxIntensity,
          maxDuration,
        };
        const encrypted = await encrypt(credentialsToStore);
        const userData = {
          ...(existingUserData || {}),
          credentials: encrypted,
          lastTested: new Date().toISOString(),
          configuredBy: user.id,
          maxIntensity,
          maxDuration,
          hasOwnDevice: deviceCheck.hasDevices,
          piShockUserId,
          shockerId: finalSelectedShockerId,
          deviceCount: deviceCheck.devices?.length || 0,
          lastUpdated: new Date().toISOString(),
          bannedExecutors: Array.isArray(bannedExecutors)
            ? bannedExecutors
            : Array.isArray(existingUserData?.bannedExecutors)
              ? existingUserData.bannedExecutors
              : [],
          commandsPaused: typeof commandsPaused === 'boolean'
            ? commandsPaused
            : Boolean(existingUserData?.commandsPaused),
        };
        await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
        await Promise.allSettled([
          env.PISHOCK_KV.delete(`cache:user_status:${userId}`),
          env.PISHOCK_KV.delete(`user_status_cache:${userId}`),
        ]);

        return jsonResponse({
          success: true,
          isConnected: true,
          createShareCodeForSelected: true,
          selectedShockerId: finalSelectedShockerId || null,
          selectedShareCode: finalSelectedShareCode,
          availableShareCodesForSelected: finalSelectedShareCode ? [finalSelectedShareCode] : [],
          generatedShareCodeCount: Object.keys(mergedGeneratedShareCodes).length,
        });
      }

      const finalSharecode = disableLegacySharecode ? '' : (sharecode || '');
      const actuallyHasDevice = deviceCheck.hasDevices && Boolean(finalSelectedShockerId || finalSharecode);
      
      const credentialsToStore = {
        apiKey: finalApiKey,
        username,
        sharecode: finalSharecode,
        selectedShockerId: finalSelectedShockerId || null,
        selectedShockerName: selectedShockerName || null,
        selectedShareCode: finalSelectedShareCode,
        allowedShockerIds: normalizedAllowedShockerIds,
        allowOverLimitWithConsumable: Boolean(allowOverLimitWithConsumable),
        generatedShareCodes: mergedGeneratedShareCodes,
        generatedShareCodeGenerationFailed: shareCodeGenerationFailed,
        generatedShareCodesLastUpdated: new Date().toISOString(),
        hasOwnDevice: actuallyHasDevice,
        piShockUserId,
        shockerId: finalSelectedShockerId,
        deviceCount: deviceCheck.devices?.length || 0,
        lastValidated: new Date().toISOString(),
        maxIntensity,
        maxDuration
      };
      
      const encrypted = await encrypt(credentialsToStore);
      
      const userData = {
        credentials: encrypted,
        lastTested: new Date().toISOString(),
        configuredBy: user.id,
        maxIntensity,
        maxDuration,
        hasOwnDevice: actuallyHasDevice,
        piShockUserId,
        shockerId: finalSelectedShockerId,
        deviceCount: deviceCheck.devices?.length || 0,
        lastUpdated: new Date().toISOString(),
        bannedExecutors: Array.isArray(bannedExecutors) ? bannedExecutors : [],
        commandsPaused: typeof commandsPaused === 'boolean'
          ? commandsPaused
          : Boolean(existingUserData?.commandsPaused),
      };
      
      if (hasSettingsChanged(existingUserData, userData)) {
        await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
      }

      try {
        const cacheKeys = [
          `cache:user_status:${userId}`,
          `user_status_cache:${userId}`,
        ];
        
        await Promise.allSettled(cacheKeys.map(key => env.PISHOCK_KV.delete(key)));
      } catch (error) {
        // Silently handle cache clear errors
      }

      return jsonResponse({ 
        success: true, 
        isConnected: true,
        hasOwnDevice: true,
        deviceCount: deviceCheck.devices?.length || 0,
        piShockUserId,
        selectedShockerId: finalSelectedShockerId || null,
        shockerId: finalSelectedShockerId,
        selectedShockerName: selectedShockerName || null,
        allowedShockerIds: normalizedAllowedShockerIds,
        allowOverLimitWithConsumable: Boolean(allowOverLimitWithConsumable),
        commandsPaused: Boolean(userData.commandsPaused),
        deprecations: shareCodeGenerationFailed ? [
          'Legacy bridge sharecode generation failed. Commands will use direct shocker control fallback.'
        ] : [],
        selectedShareCode: finalSelectedShareCode,
        availableShareCodesForSelected: finalSelectedShareCode ? [finalSelectedShareCode] : [],
        debug: {
          credentialValidation: credentialValidation.debugInfo,
          deviceCheck: deviceCheck.debugInfo,
          shockerIdsHiddenNotOnDevices: deviceCheck.shockerIdsHiddenNotOnDevices,
          shareCodeGeneration: {
            generatedShareCodeCount: Object.keys(mergedGeneratedShareCodes).length,
            hasSelectedShareCode: Boolean(finalSelectedShareCode),
            failed: shareCodeGenerationFailed,
            status: generatedShareCodesResult.status,
            error: generatedShareCodesResult.error,
            rawBody: generatedShareCodesResult.rawBody,
          },
          usingLegacySharecodeFallback: false
        }
      });
    }

    if (method === 'DELETE') {
      await env.PISHOCK_KV.delete(`user:${userId}:data`);
      return jsonResponse({ success: true });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('User PiShock settings error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      debug: {
        step: 'general_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }, 500);
  }
};