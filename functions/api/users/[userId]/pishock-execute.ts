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
  targetUserId: string;
  targetUsername: string;
  targetAvatar?: string;
  action: 'shock' | 'vibrate' | 'beep';
  intensity: number;
  duration: number;
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

async function addToActivityBatch(kv: KVNamespace, entry: ActivityLogEntry) {
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

async function executePiShockCommand(
  apiKey: string, 
  username: string, 
  shareCode: string, 
  operation: number, 
  intensity: number, 
  duration: number
): Promise<{ success: boolean; error?: string; response?: string }> {
  try {
    console.log('EXECUTE: Starting PiShock command execution');
    console.log('EXECUTE: Operation:', operation, '(0=shock, 1=vibrate, 2=beep)');
    console.log('EXECUTE: ShareCode:', shareCode);
    console.log('EXECUTE: Intensity:', intensity, 'Duration:', duration);

    // Use form-encoded data for PiShock API (this is what actually works!)
    const formData = new URLSearchParams();
    formData.append('code', shareCode);
    formData.append('duration', duration.toString());
    formData.append('intensity', intensity.toString());
    formData.append('op', operation.toString());
    formData.append('apikey', apiKey);
    formData.append('username', username);
    formData.append('name', 'DiscordActivity-v4');

    console.log('EXECUTE: Sending command to PiShock API');
    
    const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'PiShock-Discord-Activity/4.0'
      },
      body: formData.toString()
    });

    const responseText = await response.text();
    console.log('EXECUTE: PiShock API response status:', response.status);
    console.log('EXECUTE: PiShock API response:', responseText);

    if (!response.ok) {
      throw new Error(`PiShock API error: HTTP ${response.status} - ${responseText}`);
    }

    // Check for specific success/error responses
    if (responseText.toLowerCase().includes('error') || responseText.toLowerCase().includes('fail')) {
      throw new Error(`PiShock API returned error: ${responseText}`);
    }

    console.log('EXECUTE: ✓ Command executed successfully');
    return { success: true, response: responseText };
    
  } catch (error) {
    console.error('EXECUTE: Command execution failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      response: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const method = request.method;
  const targetUserId = params.userId as string;

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
    const { executorUserId, intensity, duration, operation } = await request.json();

    console.log('EXECUTE: Starting PiShock command execution');
    console.log('EXECUTE: Target user:', targetUserId);
    console.log('EXECUTE: Executor user:', executorUserId);
    console.log('EXECUTE: Operation:', operation, '(0=shock, 1=vibrate, 2=beep)');
    console.log('EXECUTE: Intensity:', intensity, 'Duration:', duration);

    // Validate parameters
    if (!executorUserId || !targetUserId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters. All fields are required and must be within valid ranges.' 
      }, 400);
    }

    // Get target user's data
    console.log('EXECUTE: Getting target user data');
    const targetUserDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
    if (!targetUserDataStr) {
      return jsonResponse({ 
        success: false, 
        error: `Target user has no PiShock configuration. They need to set up their credentials first.`
      });
    }

    const targetUserData = JSON.parse(targetUserDataStr);
    if (!targetUserData?.credentials) {
      return jsonResponse({ 
        success: false, 
        error: `Target user has no PiShock credentials configured.`
      });
    }

    // Decrypt target user's credentials
    const targetCreds = await decrypt(targetUserData.credentials);
    console.log('EXECUTE: Target user credentials decrypted');

    // Check if target user has devices
    if (!targetUserData.hasDevices) {
      return jsonResponse({ 
        success: false, 
        error: 'Target user has no PiShock devices configured.' 
      });
    }

    // Check intensity/duration limits from target user's settings
    const maxIntensity = targetUserData.maxIntensity || 100;
    const maxDuration = targetUserData.maxDuration || 15;
    
    if (intensity > maxIntensity) {
      return jsonResponse({ 
        success: false, 
        error: `Intensity ${intensity}% exceeds target user's limit of ${maxIntensity}%` 
      });
    }
    
    if (duration > maxDuration) {
      return jsonResponse({ 
        success: false, 
        error: `Duration ${duration}s exceeds target user's limit of ${maxDuration}s` 
      });
    }

    // Get executor's credentials for authentication
    console.log('EXECUTE: Getting executor credentials for API authentication');
    const executorDataStr = await env.PISHOCK_KV.get(`user:${executorUserId}:data`);
    if (!executorDataStr) {
      return jsonResponse({ 
        success: false, 
        error: 'You need to configure your own PiShock credentials to send commands' 
      });
    }

    const executorData = JSON.parse(executorDataStr);
    if (!executorData?.credentials) {
      return jsonResponse({ 
        success: false, 
        error: 'You need to configure your own PiShock credentials to send commands' 
      });
    }

    const executorCreds = await decrypt(executorData.credentials);
    console.log('EXECUTE: Executor credentials decrypted');

    // Determine which shareCode to use
    let shareCodeToUse = targetUserData.selectedSharecode;
    
    if (!shareCodeToUse) {
      // Fallback to first available sharecode
      if (targetUserData.availableSharecodes && targetUserData.availableSharecodes.length > 0) {
        shareCodeToUse = targetUserData.availableSharecodes[0].code || targetUserData.availableSharecodes[0].shareCode;
        console.log('EXECUTE: Using first available sharecode as fallback:', shareCodeToUse);
      } else {
        return jsonResponse({ 
          success: false, 
          error: 'Target user has no share codes available. They need to create share codes in their PiShock account.' 
        });
      }
    }

    console.log('EXECUTE: Using shareCode:', shareCodeToUse);

    // Execute the PiShock command using executor's credentials and target's sharecode
    const result = await executePiShockCommand(
      executorCreds.apiKey,
      executorCreds.username,
      shareCodeToUse,
      operation,
      intensity,
      duration
    );

    if (!result.success) {
      throw new Error(result.error || 'PiShock command failed');
    }

    // Get user info for logging
    const executorUserData = await env.PISHOCK_KV.get(`discord_user:${executorUserId}`);
    const executorUser = executorUserData ? JSON.parse(executorUserData) : null;
    
    const targetUserDiscordData = await env.PISHOCK_KV.get(`discord_user:${targetUserId}`);
    const targetUser = targetUserDiscordData ? JSON.parse(targetUserDiscordData) : null;

    // Create activity log entry
    const operationNames = ['shock', 'vibrate', 'beep'];
    const logEntry: ActivityLogEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      instanceId: 'global',
      executorUserId,
      executorUsername: executorUser?.global_name || executorUser?.username || 'Unknown User',
      executorAvatar: executorUser?.avatar ? `https://cdn.discordapp.com/avatars/${executorUserId}/${executorUser.avatar}.png` : undefined,
      targetUserId,
      targetUsername: targetUser?.global_name || targetUser?.username || 'Unknown User',
      targetAvatar: targetUser?.avatar ? `https://cdn.discordapp.com/avatars/${targetUserId}/${targetUser.avatar}.png` : undefined,
      action: operationNames[operation] as 'shock' | 'vibrate' | 'beep',
      intensity,
      duration,
    };

    // Store activity log entry
    await addToActivityBatch(env.PISHOCK_KV, logEntry);

    console.log('EXECUTE: Activity logged with ID:', logEntry.id);

    return jsonResponse({ 
      success: true, 
      logEntryId: logEntry.id,
      message: `${operationNames[operation]} command executed successfully`,
      debug: {
        shareCodeUsed: shareCodeToUse,
        maxIntensity,
        maxDuration,
        piShockResponse: result.response
      }
    });

  } catch (error) {
    console.error('EXECUTE: Command execution failed:', error);
    return jsonResponse({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Command execution failed' 
    });
  }
};