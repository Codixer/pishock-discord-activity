interface Env {
  PISHOCK_KV: KVNamespace;
}

interface AvailableShocker {
  shockerId: string;
  ownerUserId: string;
  ownerUsername: string;
  ownerDisplayName: string;
  ownerAvatar?: string;
  deviceName: string;
  maxIntensity: number;
  maxDuration: number;
  isOnline: boolean;
  lastSeen?: string;
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

async function validateDiscordToken(token: string): Promise<any> {
  try {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error('Invalid Discord token');
    }
    
    return await response.json();
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

async function getUserDevices(apiKey: string, username: string): Promise<{ hasDevices: boolean; devices?: any[]; error?: string }> {
  try {
    const url = `https://ps.pishock.com/PiShock/GetUserDevices?userId=0&token=${encodeURIComponent(apiKey)}&api=true`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/2.0',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return { hasDevices: false, error: `HTTP ${response.status}` };
    }

    const responseText = await response.text();
    let devicesData;
    
    try {
      devicesData = JSON.parse(responseText);
    } catch (parseError) {
      return { hasDevices: false, error: 'Invalid response format' };
    }

    if (!Array.isArray(devicesData)) {
      return { hasDevices: false, error: 'No devices data' };
    }

    // Filter devices that have shockers
    const devicesWithShockers = devicesData.filter(device => 
      device.shockers && Array.isArray(device.shockers) && device.shockers.length > 0
    );

    return { 
      hasDevices: devicesWithShockers.length > 0, 
      devices: devicesWithShockers 
    };
  } catch (error) {
    console.error('Error getting user devices:', error);
    return { hasDevices: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export const onRequest = async (context: { request: Request; env: Env; params: Record<string, string> }) => {
  const { request, env } = context;
  const method = request.method;

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

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    console.log('Getting available shockers for user:', user.id);
    
    // Get all user data keys to find users with credentials
    const userKeys = await env.PISHOCK_KV.list({ prefix: 'user:' });
    const availableShockers: AvailableShocker[] = [];

    for (const key of userKeys.keys) {
      if (!key.name.endsWith(':data')) continue;
      
      const userId = key.name.split(':')[1];
      if (!userId) continue;

      try {
        const userDataStr = await env.PISHOCK_KV.get(key.name);
        if (!userDataStr) continue;

        const userData = JSON.parse(userDataStr);
        if (!userData?.credentials || !userData?.hasDevices) continue;

        // Decrypt credentials to get API access
        const creds = await decrypt(userData.credentials);
        
        // Get user's devices
        const deviceCheck = await getUserDevices(creds.apiKey, creds.username);
        if (!deviceCheck.hasDevices || !deviceCheck.devices) continue;

        // Get Discord user info for display
        const discordUserData = await env.PISHOCK_KV.get(`discord_user:${userId}`);
        const discordUser = discordUserData ? JSON.parse(discordUserData) : null;

        // Extract shockers from all devices
        for (const device of deviceCheck.devices) {
          if (!device.shockers || !Array.isArray(device.shockers)) continue;

          for (const shocker of device.shockers) {
            availableShockers.push({
              shockerId: shocker.shockerId.toString(),
              ownerUserId: userId,
              ownerUsername: discordUser?.username || creds.username,
              ownerDisplayName: discordUser?.global_name || discordUser?.username || creds.username,
              ownerAvatar: discordUser?.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${discordUser.avatar}.png` : undefined,
              deviceName: device.name || `Device ${device.clientId}`,
              maxIntensity: userData.maxIntensity || 100,
              maxDuration: userData.maxDuration || 15,
              isOnline: device.isOnline || false,
              lastSeen: device.lastSeen
            });
          }
        }

      } catch (error) {
        console.error(`Error processing user ${userId}:`, error);
        continue;
      }
    }

    console.log(`Found ${availableShockers.length} available shockers`);

    return jsonResponse({
      success: true,
      shockers: availableShockers,
      count: availableShockers.length
    });

  } catch (error) {
    console.error('Available shockers error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};
