import {
  generateLegacyShareCodesForOwnedShockers,
  getAllowedShockersForController,
  getGeneratedShareCodeForShocker,
  getPiShockAccount,
  normalizeGeneratedShareCodes,
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

async function encrypt(data: any): Promise<string> {
  return btoa(JSON.stringify(data));
}

async function validatePiShockCredentials(apiKey: string, username: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
  const accountResult = await getPiShockAccount({ apiKey, username });
  if (!accountResult.ok) {
    return { valid: false, error: accountResult.error || 'Credential validation failed.' };
  }
  const userId = accountResult.data?.UserId;
  if (userId === undefined || userId === null) {
    return { valid: false, error: 'No PiShock user id returned.' };
  }
  return { valid: true, userId: String(userId) };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const method = request.method;
  const instanceId = params.instanceId as string;

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

  try {
    if (method === 'PUT') {
      const { apiKey, username, selectedShockerId, sharecode } = await request.json();

      if (!apiKey || !username || !selectedShockerId) {
        return jsonResponse({ 
          success: false, 
          error: 'Missing required fields: apiKey, username, selectedShockerId' 
        }, 400);
      }

      const credentialValidation = await validatePiShockCredentials(apiKey, username);
      if (!credentialValidation.valid || !credentialValidation.userId) {
        return jsonResponse({
          success: false,
          isConnected: false,
          error: credentialValidation.error || 'Failed to validate PiShock credentials.',
        }, 400);
      }

      const credentials = {
        apiKey,
        username,
        piShockUserId: credentialValidation.userId,
      };
      const allowedResult = await getAllowedShockersForController(credentials);
      if (!allowedResult.ok || !allowedResult.data) {
        return jsonResponse({
          success: false,
          isConnected: false,
          error: allowedResult.error || 'Unable to list allowed shockers for this account.',
        }, 502);
      }
      const ownedShockerIds = allowedResult.data.allowedShockers
        .filter((shocker: any) => shocker?.ShockerId !== undefined && shocker?.ShockerId !== null)
        .map((shocker: any) => String(shocker.ShockerId));
      if (!ownedShockerIds.includes(String(selectedShockerId))) {
        return jsonResponse({
          success: false,
          isConnected: false,
          error: 'Selected shocker is not an active owned device for this PiShock account.',
        }, 400);
      }

      const generatedShareCodesResult = await generateLegacyShareCodesForOwnedShockers(credentials, ownedShockerIds);
      const generatedShareCodes = generatedShareCodesResult.data
        ? normalizeGeneratedShareCodes(generatedShareCodesResult.data)
        : {};
      if (!getGeneratedShareCodeForShocker(generatedShareCodes, String(selectedShockerId))) {
        return jsonResponse({
          success: false,
          isConnected: false,
          error:
            generatedShareCodesResult.error ||
            'Failed to generate sharecode for the selected shocker.',
        }, 502);
      }
      const selectedShareCode = getGeneratedShareCodeForShocker(generatedShareCodes, String(selectedShockerId));
      if (!selectedShareCode) {
        return jsonResponse({
          success: false,
          isConnected: false,
          error: 'Selected shocker is missing a generated sharecode.',
        }, 502);
      }

      const testResult = await operatePiShockShareCode(credentials, selectedShareCode, {
        operation: 2,
        intensity: 1,
        durationSeconds: 1,
        agentName: 'DiscordActivityConnectionTest',
      });
      if (!testResult.ok) {
        return jsonResponse({
          success: false,
          isConnected: false,
          error: testResult.error || 'Unable to verify generated sharecode with test operation.',
        }, 502);
      }

      const encrypted = await encrypt({
        apiKey,
        username,
        sharecode: sharecode || '',
        selectedShockerId: String(selectedShockerId),
        shockerId: String(selectedShockerId),
        generatedShareCodes,
        generatedShareCodesLastUpdated: new Date().toISOString(),
        piShockUserId: credentialValidation.userId,
      });
      await Promise.all([
        env.PISHOCK_KV.put(`instance:${instanceId}:pishock`, encrypted, { expirationTtl: 21600 }),
        env.PISHOCK_KV.put(`instance:${instanceId}:pishock:lastTested`, new Date().toISOString(), { expirationTtl: 21600 }),
        env.PISHOCK_KV.put(`instance:${instanceId}:pishock:configuredBy`, user.id, { expirationTtl: 21600 })
      ]);

      return jsonResponse({
        success: true,
        isConnected: true,
        selectedShockerId: String(selectedShockerId),
        generatedShareCodeCount: Object.keys(generatedShareCodes).length,
      });
    }

    if (method === 'DELETE') {
      await Promise.all([
        env.PISHOCK_KV.delete(`instance:${instanceId}:pishock`),
        env.PISHOCK_KV.delete(`instance:${instanceId}:pishock:lastTested`),
        env.PISHOCK_KV.delete(`instance:${instanceId}:pishock:configuredBy`)
      ]);
      return jsonResponse({ success: true });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('PiShock settings error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};