import { getPiShockAccount, listPiShockShockers } from '../../_shared/pishock-client';

// Type declarations for Cloudflare Workers
declare global {
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }
}

interface Env {
  PISHOCK_KV: KVNamespace;
}

interface PagesFunction<Env = unknown> {
  (context: { request: Request; env: Env; params: Record<string, string>; waitUntil: (promise: Promise<any>) => void; passThroughOnException: () => void; }): Promise<Response> | Response;
}

function jsonResponse(body: any, status = 200, additionalHeaders: Record<string, string> = {}) {
  const headers = { 
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...additionalHeaders
  };
  
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

async function requireAuth(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

// Optimized token validation with user-ID based caching
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
      console.log('TOKEN_VALIDATION: Token validation failed:', response.status);
      throw new Error('Invalid Discord token');
    }
      const userData = await response.json();
    console.log('TOKEN_VALIDATION: ✓ Token validation successful for user:', userData.id);
    
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
    
    // Cache the parsed userData, not the response
    await kv.put(cacheKey, JSON.stringify({
      ...userData,
      token_expires_at: expiresAt
    }), {
      expirationTtl: cacheTtl // Match token expiry
    });
    
    return userData;
  } catch (error) {
    console.error('TOKEN_VALIDATION: Error validating token:', error);
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

async function validatePiShockCredentials(apiKey: string, username: string): Promise<{ valid: boolean; userId?: string }> {
  const accountResult = await getPiShockAccount({ apiKey, username });
  if (!accountResult.ok) {
    return { valid: false };
  }

  const userId = accountResult.data?.UserId;
  if (userId === undefined || userId === null) {
    return { valid: false };
  }

  return { valid: true, userId: String(userId) };
}

function getUserStatusCacheKey(userId: string): string {
  return `cache:user_status:${userId}`;
}

async function getCachedUserStatus(kv: KVNamespace, userId: string) {
  try {
    const cacheKey = getUserStatusCacheKey(userId);
    const cached = await kv.get(cacheKey);
    if (cached) {
      const cachedData = JSON.parse(cached);
      const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
      if (cacheAge < 60000) { // 1 minute cache
        return cachedData.status;
      }
    }
  } catch (error) {
    // Silently handle cache errors
    console.warn('Cache read error:', error);
  }
  return null;
}

async function setCachedUserStatus(kv: KVNamespace, userId: string, newStatus: any) {
  try {
    const cacheKey = getUserStatusCacheKey(userId);
    
    // Check if we need to update the cache
    const existing = await kv.get(cacheKey);
    if (existing) {
      const existingData = JSON.parse(existing);
      const hasChanges = existingData.status?.isConnected !== newStatus.isConnected ||
                        existingData.status?.hasCredentials !== newStatus.hasCredentials ||
                        existingData.status?.maxIntensity !== newStatus.maxIntensity ||
                        existingData.status?.maxDuration !== newStatus.maxDuration ||
                        existingData.status?.commandsPaused !== newStatus.commandsPaused ||
                        existingData.status?.canShock !== newStatus.canShock ||
                        existingData.status?.canVibrate !== newStatus.canVibrate ||
                        existingData.status?.canBeep !== newStatus.canBeep;
      
      if (!hasChanges) {
        return; // No changes, don't update cache
      }
    }

    // Store the new status with timestamp
    const cacheData = {
      status: newStatus,
      timestamp: new Date().toISOString()
    };
    
    await kv.put(cacheKey, JSON.stringify(cacheData), {
      expirationTtl: 120 // 2 minutes
    });
  } catch (error) {
    // Silently handle cache errors
    console.warn('Cache write error:', error);
  }
}

async function clearUserStatusCache(kv: KVNamespace, userId: string) {
  try {
    const cacheKey = getUserStatusCacheKey(userId);
    await kv.delete(cacheKey);
  } catch (error) {
    // Silently handle cache errors
    console.warn('Cache delete error:', error);
  }
}

async function checkUserDevices(userId: string, apiKey: string, username: string): Promise<{ hasDevices: boolean; devices?: any[] }> {
  const shockersResult = await listPiShockShockers({
    apiKey,
    username,
    piShockUserId: userId,
  });

  if (!shockersResult.ok) {
    return { hasDevices: false };
  }

  const devices = Array.isArray(shockersResult.data) ? shockersResult.data : [];
  return { hasDevices: devices.length > 0, devices };
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

  if (method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });
  
  try {
    const cachedStatus = await getCachedUserStatus(env.PISHOCK_KV, userId);
    if (cachedStatus) {
      return jsonResponse(cachedStatus, 200, {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
        'X-Cache-Status': 'HIT'
      });
    }
    
    const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
    const userData = userDataStr ? JSON.parse(userDataStr) : null;
    
    let isConnected = false;
    let hasDevice = false;
    let deviceCount = 0;
    let piShockUserId = userData?.piShockUserId;
    const lastTested = userData?.lastTested;
    const hasOwnDevice = userData?.hasOwnDevice || false;
    const encrypted = userData?.credentials;
    
    let maxIntensity = 100;
    let maxDuration = 15;
    let selectedShockerId: string | null = null;
    let selectedShockerName: string | null = null;
    let usingLegacySharecodeFallback = false;
    let allowedShockerIds: string[] = [];
    let allowOverLimitWithConsumable = false;
    let commandsPaused = Boolean(userData?.commandsPaused);
    let canShock = true;
    let canVibrate = true;
    let canBeep = true;
    let canPause = false;
    let maxIntensityOverriddenByApi = false;
    let maxDurationOverriddenByApi = false;
    
    if (encrypted) {
      try {
        const creds = await decrypt(encrypted);
        
        maxIntensity = creds.maxIntensity || 100;
        maxDuration = creds.maxDuration || 15;
        selectedShockerId = creds.selectedShockerId || creds.shockerId || null;
        selectedShockerName = creds.selectedShockerName || null;
        usingLegacySharecodeFallback = Boolean(creds.sharecode && !creds.selectedShockerId);
        allowedShockerIds = Array.isArray(creds.allowedShockerIds) ? creds.allowedShockerIds.map((id: any) => String(id)) : [];
        allowOverLimitWithConsumable = Boolean(creds.allowOverLimitWithConsumable);
        
        const credentialValidation = await validatePiShockCredentials(creds.apiKey, creds.username);
        isConnected = credentialValidation.valid;
        
        if (isConnected && credentialValidation.userId) {
          piShockUserId = credentialValidation.userId;
          
          const deviceCheck = await checkUserDevices(credentialValidation.userId, creds.apiKey, creds.username);
          hasDevice = deviceCheck.hasDevices;
          deviceCount = deviceCheck.devices?.length || 0;
          const ownedShockerIds = new Set(
            Array.isArray(deviceCheck.devices)
              ? deviceCheck.devices
                  .filter((shocker: any) => shocker?.ShockerId !== undefined && shocker?.ShockerId !== null)
                  .map((shocker: any) => String(shocker.ShockerId))
              : []
          );
          if (selectedShockerId && !ownedShockerIds.has(String(selectedShockerId))) {
            selectedShockerId = null;
            selectedShockerName = null;
          }
          allowedShockerIds = allowedShockerIds.filter((id) => ownedShockerIds.has(String(id)));
          if (selectedShockerId && Array.isArray(deviceCheck.devices)) {
            hasDevice = deviceCheck.devices.some((shocker: any) => String(shocker.ShockerId) === String(selectedShockerId));
            const selectedShocker = deviceCheck.devices.find(
              (shocker: any) => String(shocker?.ShockerId) === String(selectedShockerId)
            );
            if (selectedShocker) {
              canShock = Boolean(selectedShocker.CanShock);
              canVibrate = Boolean(selectedShocker.CanVibrate);
              canBeep = Boolean(selectedShocker.CanBeep);
              canPause = Boolean(selectedShocker.CanPause);

              const apiMaxIntensity = Number(selectedShocker.MaxIntensity);
              if (Number.isFinite(apiMaxIntensity) && apiMaxIntensity > 0) {
                const boundedIntensity = Math.min(maxIntensity, Math.floor(apiMaxIntensity));
                maxIntensityOverriddenByApi = boundedIntensity < maxIntensity;
                maxIntensity = boundedIntensity;
              }

              const apiMaxDurationMs = Number(selectedShocker.MaxDuration);
              if (Number.isFinite(apiMaxDurationMs) && apiMaxDurationMs > 0) {
                const apiMaxDurationSeconds = Math.max(1, Math.floor(apiMaxDurationMs / 1000));
                const boundedDuration = Math.min(maxDuration, apiMaxDurationSeconds);
                maxDurationOverriddenByApi = boundedDuration < maxDuration;
                maxDuration = boundedDuration;
              }
            }
          }
          
          // Only write to KV if piShockUserId has changed
          if (piShockUserId !== userData?.piShockUserId) {
            userData.piShockUserId = piShockUserId;
            userData.lastTested = new Date().toISOString();
            await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
          }
        }
      } catch (error) {
        isConnected = false;
        hasDevice = false;
      }
    }

    const result = { 
      hasCredentials: !!userData?.credentials, 
      isConnected, 
      hasDevice,
      deviceCount,
      hasOwnDevice,
      piShockUserId,
      selectedShockerId,
      selectedShockerName,
      allowedShockerIds,
      allowOverLimitWithConsumable,
      commandsPaused,
      canShock,
      canVibrate,
      canBeep,
      canPause,
      usingLegacySharecodeFallback,
      lastTested,
      isRelay: false,
      maxIntensity,
      maxDuration,
      maxIntensityOverriddenByApi,
      maxDurationOverriddenByApi,
      deprecations: usingLegacySharecodeFallback ? [
        'Legacy share code fallback in use. Re-save settings by selecting a shocker.'
      ] : []
    };
    
    await setCachedUserStatus(env.PISHOCK_KV, userId, result);
    
    return jsonResponse(result, 200, {
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=15',
    });
  } catch (error) {
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};