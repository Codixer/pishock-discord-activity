import {
  getPiShockAccount,
  listPiShockShockers,
  mapShockersToOptions,
  resolvePiShockShockerId,
  operatePiShockShocker,
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
      // Match caching with status endpoint to prevent inconsistency
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
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

async function checkUserDevices(userId: string, apiKey: string, username: string): Promise<{ hasDevices: boolean; devices?: any[]; error?: string; debugInfo?: any }> {
  const shockersResult = await listPiShockShockers({
    apiKey,
    username,
    piShockUserId: userId,
  });

  if (!shockersResult.ok) {
    return {
      hasDevices: false,
      error: shockersResult.error || 'Device check failed',
      debugInfo: { status: shockersResult.status, rawBody: shockersResult.rawBody },
    };
  }

  const devices = Array.isArray(shockersResult.data) ? shockersResult.data : [];
  return {
    hasDevices: devices.length > 0,
    devices,
    debugInfo: { deviceCount: devices.length },
  };
}

async function validateShareCode(username: string, apiKey: string, sharecode: string, piShockUserId?: string): Promise<{ valid: boolean; shockerId?: string; error?: string; debugInfo?: any }> {
  const credentials = { apiKey, username, piShockUserId };
  // Deprecated path: share code validation remains only for legacy records.
  const shockerResult = await resolvePiShockShockerId(credentials, sharecode, { allowDefaultFallback: true });
  if (!shockerResult.ok || !shockerResult.data) {
    return {
      valid: false,
      error: shockerResult.error || 'Unable to resolve share code to a shocker.',
      debugInfo: { status: shockerResult.status },
    };
  }

  const operateResult = await operatePiShockShocker(credentials, shockerResult.data, {
    operation: 2,
    intensity: 1,
    durationSeconds: 1,
    agentName: 'DiscordActivityShareCodeValidation',
  });

  if (!operateResult.ok) {
    return {
      valid: false,
      shockerId: shockerResult.data,
      error: operateResult.error || 'Share code validation operation failed.',
      debugInfo: { status: operateResult.status, rawBody: operateResult.rawBody },
    };
  }

  return {
    valid: true,
    shockerId: shockerResult.data,
    debugInfo: { status: operateResult.status },
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
         existingCreds.selectedShockerId !== newCreds.selectedShockerId ||
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
        if (creds.apiKey && creds.username) {
          const shockersResult = await listPiShockShockers({
            apiKey: creds.apiKey,
            username: creds.username,
            piShockUserId: creds.piShockUserId,
          });
          if (shockersResult.ok && Array.isArray(shockersResult.data)) {
            availableShockers = mapShockersToOptions(shockersResult.data);
          }
        }
        const ownedShockerIds = new Set(availableShockers.map((shocker) => String(shocker.id)));

        const usingLegacySharecodeFallback = Boolean(creds.sharecode && !creds.selectedShockerId);
        const storedSelectedShockerId = creds.selectedShockerId || creds.shockerId || '';
        const resolvedSelectedShockerId = ownedShockerIds.has(String(storedSelectedShockerId))
          ? String(storedSelectedShockerId)
          : '';
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
          availableShockers,
          allowedShockerIds,
          allowOverLimitWithConsumable: Boolean(creds.allowOverLimitWithConsumable),
          usingLegacySharecodeFallback,
          hasOwnDevice: true,
          maxIntensity: creds.maxIntensity || 100,
          maxDuration: creds.maxDuration || 15,
          lastUpdated: userData.lastUpdated,
          piShockUserId: creds.piShockUserId,
          bannedExecutors: userData.bannedExecutors || []
        };
        
        return jsonResponse({ 
          hasSettings: true,
          settings,
          bannedExecutors: userData.bannedExecutors || [],
          deprecations: usingLegacySharecodeFallback ? [
            'Share code configuration is deprecated. Please select a shocker from your account.'
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
    }    if (method === 'PUT') {
      const { 
        apiKey, 
        username, 
        sharecode, 
        selectedShockerId,
        allowedShockerIds = [],
        allowOverLimitWithConsumable = false,
        disableLegacySharecode = false,
        hasOwnDevice, 
        maxIntensity = 100, 
        maxDuration = 15,
        bannedExecutors = []
      } = await request.json();

      const existingUserDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
      const existingUserData = existingUserDataStr ? JSON.parse(existingUserDataStr) : null;
      const isExistingUser = !!existingUserData?.credentials;
      
      const isBanListOnlyUpdate = !apiKey && !username && !sharecode && !selectedShockerId &&
                                 Array.isArray(bannedExecutors) && 
                                 isExistingUser;
      
      if (isBanListOnlyUpdate) {
        const updatedUserData = {
          ...existingUserData,
          bannedExecutors: Array.isArray(bannedExecutors) ? bannedExecutors : [],
          lastUpdated: new Date().toISOString()
        };
        
        await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(updatedUserData));
        
        return jsonResponse({ 
          success: true,
          banListUpdated: true,
          bannedExecutors: updatedUserData.bannedExecutors
        });
      } else {
        if (!isExistingUser && (!apiKey || !username || (!selectedShockerId && !sharecode))) {
          return jsonResponse({ 
            success: false, 
            error: 'Missing required fields: API Key, Username, and either Selected Shocker or legacy Share Code are required' 
          }, 400);
        }
        
        if (!username || (!selectedShockerId && !sharecode)) {
          return jsonResponse({ 
            success: false, 
            error: 'Username and Selected Shocker are required (share code is deprecated)' 
          }, 400);
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
      
      const deviceCheck = await checkUserDevices(piShockUserId, finalApiKey, username);
      const availableShockers = mapShockersToOptions(deviceCheck.devices || []);
      let finalSelectedShockerId = selectedShockerId || '';
      let selectedShockerName = '';
      let shareCodeValid = true;
      let shareCodeError: string | null = null;
      let shareCodeDebug: any = null;
      let shareCodeShockerId: string | null = null;
      let usingLegacySharecodeFallback = false;

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
      
      if (!finalSelectedShockerId && sharecode) {
        // Deprecated: retain legacy share-code resolution for already configured users only.
        usingLegacySharecodeFallback = true;
        const shareCodeValidation = await validateShareCode(username, finalApiKey, sharecode, piShockUserId);
        shareCodeValid = shareCodeValidation.valid;
        shareCodeError = shareCodeValidation.error || null;
        shareCodeDebug = shareCodeValidation.debugInfo;
        shareCodeShockerId = shareCodeValidation.shockerId || null;
        
        if (!shareCodeValid) {
          return jsonResponse({ 
            success: false, 
            isConnected: false, 
            error: shareCodeError || 'Invalid share code. Please check your device share code.',
            debug: {
              step: 'share_code_validation',
              ...shareCodeDebug
            }
          });
        }
        finalSelectedShockerId = shareCodeShockerId || '';
      }

      const normalizedAllowedShockerIds = (Array.isArray(allowedShockerIds) ? allowedShockerIds : [])
        .map((id) => String(id))
        .filter((id) => availableShockers.some((shocker) => shocker.id === id));
      if (finalSelectedShockerId && !normalizedAllowedShockerIds.includes(finalSelectedShockerId)) {
        normalizedAllowedShockerIds.push(finalSelectedShockerId);
      }

      const finalSharecode = disableLegacySharecode ? '' : (sharecode || '');
      const actuallyHasDevice = deviceCheck.hasDevices && Boolean(finalSelectedShockerId || finalSharecode);
      
      const credentialsToStore = {
        apiKey: finalApiKey,
        username,
        sharecode: finalSharecode,
        selectedShockerId: finalSelectedShockerId || null,
        selectedShockerName: selectedShockerName || null,
        allowedShockerIds: normalizedAllowedShockerIds,
        allowOverLimitWithConsumable: Boolean(allowOverLimitWithConsumable),
        hasOwnDevice: actuallyHasDevice,
        piShockUserId,
        shockerId: finalSelectedShockerId || shareCodeShockerId,
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
        shockerId: finalSelectedShockerId || shareCodeShockerId,
        deviceCount: deviceCheck.devices?.length || 0,
        lastUpdated: new Date().toISOString(),
        bannedExecutors: Array.isArray(bannedExecutors) ? bannedExecutors : []
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
        shockerId: finalSelectedShockerId || shareCodeShockerId,
        selectedShockerName: selectedShockerName || null,
        allowedShockerIds: normalizedAllowedShockerIds,
        allowOverLimitWithConsumable: Boolean(allowOverLimitWithConsumable),
        deprecations: usingLegacySharecodeFallback ? [
          'Share code save path is deprecated. Please re-save with selected shocker.'
        ] : disableLegacySharecode ? [
          'Legacy share code fallback disabled. This account now uses selected shocker only.'
        ] : [],
        debug: {
          credentialValidation: credentialValidation.debugInfo,
          deviceCheck: deviceCheck.debugInfo,
          shareCodeValidation: shareCodeDebug,
          usingLegacySharecodeFallback
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