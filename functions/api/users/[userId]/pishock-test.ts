import {
  generateLegacyShareCodesForOwnedShockers,
  getAllowedShockersForController,
  getGeneratedShareCodeForShocker,
  getPiShockAccount,
  normalizeGeneratedShareCodes,
  operatePiShockShocker,
  operatePiShockShareCode,
} from '../../_shared/pishock-client';

interface Env {
  PISHOCK_KV: KVNamespace;
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

async function decrypt(encryptedData: string): Promise<any> {
  try {
    const dataString = atob(encryptedData);
    return JSON.parse(dataString);
  } catch (error) {
    throw new Error('Failed to decrypt data');
  }
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
    return {
      hasDevices: false,
      error: allowed.error || 'Device check failed',
      debugInfo: { status: allowed.status, rawBody: allowed.rawBody },
    };
  }

  const devices = allowed.data.allowedShockers;
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

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) {
    return new Response('Unauthorized', { status: 401 });
  }

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) {
    return new Response('Invalid token', { status: 401 });
  }

  if (user.id !== userId) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
    const userData = userDataStr ? JSON.parse(userDataStr) : null;
    
    if (!userData?.credentials) {
      return jsonResponse({ 
        success: false, 
        isConnected: false, 
        error: 'No credentials stored for this user' 
      });
    }

    try {
      const creds = await decrypt(userData.credentials);
      
      const credentialValidation = await validatePiShockCredentials(creds.apiKey, creds.username);
      
      let hasDevice = false;
      let deviceCount = 0;
      let deviceDebugInfo = null;
      let availableDevices: any[] = [];
      let selectedShockerId: string | null = creds.selectedShockerId || creds.shockerId || null;
      let selectedShockerName: string | null = creds.selectedShockerName || null;
      const allowedShockerIds: string[] = Array.isArray(creds.allowedShockerIds) ? creds.allowedShockerIds.map((id: any) => String(id)) : [];
      const allowOverLimitWithConsumable = Boolean(creds.allowOverLimitWithConsumable);
      
      if (credentialValidation.valid && credentialValidation.userId) {
        const deviceCheck = await checkUserDevices(creds.apiKey, creds.username, credentialValidation.userId);
        hasDevice = deviceCheck.hasDevices;
        deviceCount = deviceCheck.devices?.length || 0;
        deviceDebugInfo = deviceCheck.debugInfo;
        availableDevices = deviceCheck.devices || [];
        
        userData.piShockUserId = credentialValidation.userId;
        userData.lastTested = new Date().toISOString();
        await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
      }

      if (credentialValidation.valid) {
        const credentials = {
          apiKey: creds.apiKey,
          username: creds.username,
          piShockUserId: credentialValidation.userId,
        };
        const ownedShockerIds = new Set(
          Array.isArray(availableDevices)
            ? availableDevices
                .filter((shocker: any) => shocker?.ShockerId !== undefined && shocker?.ShockerId !== null)
                .map((shocker: any) => String(shocker.ShockerId))
            : []
        );
        if (!selectedShockerId || !ownedShockerIds.has(String(selectedShockerId))) {
          return jsonResponse({
            success: false,
            isConnected: false,
            error: 'No valid selected shocker is configured for this account.',
            selectedShockerId,
          });
        }

        let generatedShareCodes = normalizeGeneratedShareCodes(creds.generatedShareCodes);
        let shareCodeGenerationFailed = false;
        if (!getGeneratedShareCodeForShocker(generatedShareCodes, selectedShockerId)) {
          const generatedShareCodesResult = await generateLegacyShareCodesForOwnedShockers(credentials, [
            String(selectedShockerId),
          ]);
          const merged = {
            ...generatedShareCodes,
            ...(generatedShareCodesResult.data
              ? normalizeGeneratedShareCodes(generatedShareCodesResult.data)
              : {}),
          };
          if (!getGeneratedShareCodeForShocker(merged, selectedShockerId)) {
            shareCodeGenerationFailed = true;
          } else {
            generatedShareCodes = merged;
            creds.generatedShareCodes = generatedShareCodes;
            creds.generatedShareCodesLastUpdated = new Date().toISOString();
            userData.credentials = btoa(JSON.stringify(creds));
            await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
          }
        }

        const explicitSelectedShareCode = typeof creds.selectedShareCode === 'string'
          ? creds.selectedShareCode.trim()
          : '';
        const selectedShareCode = explicitSelectedShareCode || getGeneratedShareCodeForShocker(generatedShareCodes, selectedShockerId);
        const useDirectShockerOperation = !selectedShareCode;
        const testResult = useDirectShockerOperation
          ? await operatePiShockShocker(credentials, String(selectedShockerId), {
              operation: 2,
              intensity: 1,
              durationSeconds: 1,
              agentName: 'DiscordActivityConnectionTest',
            })
          : await operatePiShockShareCode(credentials, selectedShareCode, {
              operation: 2,
              intensity: 1,
              durationSeconds: 1,
              agentName: 'DiscordActivityConnectionTest',
            });

        if (!testResult.ok) {
          return jsonResponse({
            success: false,
            isConnected: false,
            error: testResult.error || 'PiShock test operation failed',
            selectedShockerId,
            hasGeneratedShareCodeForSelected: Boolean(selectedShareCode),
            allowedShockerIds,
            allowOverLimitWithConsumable,
            usedDirectShockerFallback: useDirectShockerOperation,
            shareCodeGenerationFailed,
          });
        }

        const selected = availableDevices.find((shocker: any) => String(shocker.ShockerId) === String(selectedShockerId));
        selectedShockerName = selected?.Name || selectedShockerName;
      }
      
      const result = {
        success: credentialValidation.valid, 
        isConnected: credentialValidation.valid, 
        hasDevice,
        deviceCount,
        piShockUserId: credentialValidation.userId,
        selectedShockerId,
        selectedShockerName,
        allowedShockerIds,
        allowOverLimitWithConsumable,
        hasGeneratedShareCodeForSelected: Boolean(getGeneratedShareCodeForShocker(creds.generatedShareCodes, selectedShockerId)),
        lastTested: userData.lastTested,
        debug: {
          credentialValidation: credentialValidation.debugInfo,
          deviceCheck: deviceDebugInfo,
          storedCredentials: {
            username: creds.username,
            hasApiKey: !!creds.apiKey,
            apiKeyLength: creds.apiKey?.length || 0,
            sharecode: creds.sharecode,
            selectedShockerId: creds.selectedShockerId || creds.shockerId || null,
            hasOwnDevice: creds.hasOwnDevice,
            generatedShareCodeCount: Object.keys(normalizeGeneratedShareCodes(creds.generatedShareCodes)).length,
          },
          deprecations: []
        }
      };
      
      if (!credentialValidation.valid) {
        result.error = credentialValidation.error || 'Credential validation failed';
      }
      
      return jsonResponse(result);
    } catch (decryptError) {
      return jsonResponse({ 
        success: false, 
        isConnected: false, 
        error: 'Failed to decrypt stored credentials',
        debug: {
          decryptionError: decryptError instanceof Error ? decryptError.message : 'Unknown error'
        }
      });
    }
  } catch (error) {
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      debug: {
        generalError: error instanceof Error ? error.message : 'Unknown error'
      }
    }, 500);
  }
};