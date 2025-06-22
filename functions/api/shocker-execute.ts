import { v4 as uuidv4 } from 'uuid';

interface Env {
  PISHOCK_KV: KVNamespace;
}

interface ActivityLogEntry {
  id: string;
  timestamp: string;
  instanceId: string;
  executorUserId: string;
  executorUsername: string;
  executorAvatar?: string;
  targetShockerId: string;
  targetShockerOwner: string;
  targetShockerOwnerName: string;
  action: 'shock' | 'vibrate' | 'beep';
  intensity: number;
  duration: number;
  deviceName: string;
  guildId?: string;
  guildName?: string;
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

    return { hasDevices: devicesData.length > 0, devices: devicesData };
  } catch (error) {
    console.error('Error getting user devices:', error);
    return { hasDevices: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function addToActivityBatch(kv: any, entry: ActivityLogEntry) {
  try {
    const date = new Date(entry.timestamp).toISOString().split('T')[0];
    const batchKey = `activity:batch:${date}`;
    
    let batch = await kv.get(batchKey);
    let batchData = batch ? JSON.parse(batch) : {
      entries: [],
      lastUpdated: entry.timestamp,
      totalCount: 0
    };
    
    batchData.entries.unshift(entry);
    batchData.lastUpdated = entry.timestamp;
    batchData.totalCount++;
    
    if (batchData.entries.length > 200) {
      batchData.entries = batchData.entries.slice(0, 200);
    }
    
    await kv.put(batchKey, JSON.stringify(batchData), { expirationTtl: 2592000 });
  } catch (error) {
    console.error('Failed to update activity batch:', error);
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

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    const { shockerId, intensity, duration, operation } = await request.json();

    // Validate parameters
    if (!shockerId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters. ShockerId is required, intensity must be 1-100, duration must be 1-15, operation must be 0, 1, or 2.' 
      }, 400);
    }

    console.log('SHOCKER-EXECUTE: Looking for shocker owner:', shockerId);

    // Find the owner of the selected shocker
    let shockerOwnerUserId: string | null = null;
    let shockerOwnerData: any = null;
    let shockerOwnerCreds: any = null;
    let targetShocker: any = null;
    let deviceName = '';

    const userKeys = await env.PISHOCK_KV.list({ prefix: 'user:' });

    for (const key of userKeys.keys) {
      if (!key.name.endsWith(':data')) continue;
      
      const userId = key.name.split(':')[1];
      if (!userId) continue;

      try {
        const userDataStr = await env.PISHOCK_KV.get(key.name);
        if (!userDataStr) continue;

        const userData = JSON.parse(userDataStr);
        if (!userData?.credentials || !userData?.hasDevices) continue;

        const creds = await decrypt(userData.credentials);
        const deviceCheck = await getUserDevices(creds.apiKey, creds.username);
        
        if (!deviceCheck.hasDevices || !deviceCheck.devices) continue;

        // Search for the target shocker in this user's devices
        for (const device of deviceCheck.devices) {
          if (!device.shockers || !Array.isArray(device.shockers)) continue;

          const foundShocker = device.shockers.find((s: any) => s.shockerId.toString() === shockerId);
          if (foundShocker) {
            shockerOwnerUserId = userId;
            shockerOwnerData = userData;
            shockerOwnerCreds = creds;
            targetShocker = foundShocker;
            deviceName = device.name || `Device ${device.clientId}`;
            break;
          }
        }

        if (targetShocker) break;
      } catch (error) {
        console.error(`Error checking user ${userId}:`, error);
        continue;
      }
    }

    if (!shockerOwnerUserId || !targetShocker) {
      return jsonResponse({ 
        success: false, 
        error: 'Selected shocker not found or no longer available' 
      });
    }

    console.log('SHOCKER-EXECUTE: Found shocker owner:', shockerOwnerUserId);

    // Check against shocker owner's limits
    const maxIntensity = shockerOwnerData.maxIntensity || 100;
    const maxDuration = shockerOwnerData.maxDuration || 15;
    
    if (intensity > maxIntensity) {
      return jsonResponse({ 
        success: false, 
        error: `Intensity ${intensity}% exceeds shocker owner's limit of ${maxIntensity}%` 
      });
    }
    
    if (duration > maxDuration) {
      return jsonResponse({ 
        success: false, 
        error: `Duration ${duration}s exceeds shocker owner's limit of ${maxDuration}s` 
      });
    }

    // Execute PiShock command using the shocker owner's credentials
    const operationNames = ['shock', 'vibrate', 'beep'];
    const operationName = operationNames[operation];
    
    console.log('SHOCKER-EXECUTE: Sending', operationName, 'command to shocker', shockerId);
    
    const payload = {
      code: targetShocker.shockerId.toString(),
      duration: duration,
      intensity: intensity,
      op: operation,
      apikey: shockerOwnerCreds.apiKey,    // Use shocker owner's API key
      username: shockerOwnerCreds.username, // Use shocker owner's username
      name: 'DiscordActivity-ShockerSelect',
      random: false,
      scale: false
    };
    
    console.log('SHOCKER-EXECUTE: Request payload:', { 
      ...payload,
      apikey: '***HIDDEN***'
    });
    
    const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'PiShock-Discord-Activity/2.0'
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('SHOCKER-EXECUTE: PiShock API response:', responseText);

    if (!response.ok) {
      throw new Error(`PiShock API error: ${responseText}`);
    }

    // Get Discord user info for logging
    const discordUserData = await env.PISHOCK_KV.get(`discord_user:${user.id}`);
    const discordUser = discordUserData ? JSON.parse(discordUserData) : null;

    const shockerOwnerDiscordData = await env.PISHOCK_KV.get(`discord_user:${shockerOwnerUserId}`);
    const shockerOwnerDiscordUser = shockerOwnerDiscordData ? JSON.parse(shockerOwnerDiscordData) : null;

    // Create activity log entry
    const logEntry: ActivityLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      instanceId: 'shocker-select', // Special instance for shocker selection mode
      executorUserId: user.id,
      executorUsername: discordUser?.global_name || discordUser?.username || user.username,
      executorAvatar: discordUser?.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${discordUser.avatar}.png` : undefined,
      targetShockerId: shockerId,
      targetShockerOwner: shockerOwnerUserId,
      targetShockerOwnerName: shockerOwnerDiscordUser?.global_name || shockerOwnerDiscordUser?.username || shockerOwnerCreds.username,
      action: operationName as 'shock' | 'vibrate' | 'beep',
      intensity,
      duration,
      deviceName,
    };

    // Store activity log entry
    await addToActivityBatch(env.PISHOCK_KV, logEntry);

    console.log('SHOCKER-EXECUTE: Activity logged with ID:', logEntry.id);

    return jsonResponse({ 
      success: true, 
      logEntryId: logEntry.id,
      message: `${operationName} command sent successfully to ${deviceName}`,
      debug: {
        targetShockerId: shockerId,
        shockerOwnerUserId,
        deviceName,
        maxIntensity,
        maxDuration,
        response: responseText
      }
    });

  } catch (error) {
    console.error('SHOCKER-EXECUTE: Command failed:', error);
    return jsonResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Command execution failed' 
    });
  }
};
