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
    // Use date-based batching to reduce key count
    const date = new Date(entry.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
    const batchKey = `activity:batch:${date}`;
    
    let batch = await kv.get(batchKey);
    let batchData = batch ? JSON.parse(batch) : {
      entries: [],
      lastUpdated: entry.timestamp,
      totalCount: 0
    };
    
    // Add new entry at the beginning (newest first)
    batchData.entries.unshift(entry);
    batchData.lastUpdated = entry.timestamp;
    batchData.totalCount++;
    
    // Limit entries per batch to prevent value size issues
    if (batchData.entries.length > 200) {
      batchData.entries = batchData.entries.slice(0, 200);
    }
    
    // Store with 30-day TTL to auto-cleanup old logs
    await kv.put(batchKey, JSON.stringify(batchData), { expirationTtl: 2592000 });
  } catch (error) {
    console.error('Failed to update activity batch:', error);
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

    console.log('EXECUTE: Starting PiShock command execution via v3 API');
    console.log('EXECUTE: Target user:', targetUserId);
    console.log('EXECUTE: Executor user:', executorUserId);
    console.log('EXECUTE: Operation:', operation, '(0=shock, 1=vibrate, 2=beep)');
    console.log('EXECUTE: Intensity:', intensity);
    console.log('EXECUTE: Duration:', duration);

    // Validate parameters
    if (!executorUserId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters' 
      }, 400);
    }

    // Get target user's data
    console.log('EXECUTE: Getting target user data for:', targetUserId);
    const targetUserDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
    const targetUserData = targetUserDataStr ? JSON.parse(targetUserDataStr) : null;
    
    if (!targetUserData?.credentials) {
      console.error('EXECUTE: Target user has no credentials configured');
      return jsonResponse({ 
        success: false, 
        error: `Target user has no PiShock device configured. They need to set up their PiShock credentials first in the application.`,
        debug: {
          targetUserId,
          executorUserId,
          targetUserDataFound: !!targetUserData,
          credentialsFound: !!targetUserData?.credentials
        }
      });
    }

    let targetCreds;
    try {
      targetCreds = await decrypt(targetUserData.credentials);
      console.log('EXECUTE: Successfully decrypted target user credentials');
      console.log('EXECUTE: Target username:', targetCreds.username);
      
      if (!targetUserData.hasDevices) {
        console.error('EXECUTE: Target user has no devices');
        return jsonResponse({ 
          success: false, 
          error: 'Target user has no PiShock devices configured.' 
        });
      }
    } catch (error) {
      console.error('EXECUTE: Failed to decrypt target user credentials:', error);
      return jsonResponse({ 
        success: false, 
        error: 'Failed to decrypt target user credentials' 
      });
    }

    // Get executor's credentials for API authentication
    console.log('EXECUTE: Getting executor user credentials for API authentication...');
    const executorDataStr = await env.PISHOCK_KV.get(`user:${executorUserId}:data`);
    const executorData = executorDataStr ? JSON.parse(executorDataStr) : null;
    
    if (!executorData?.credentials) {
      console.error('EXECUTE: Executor has no PiShock credentials configured');
      return jsonResponse({ 
        success: false, 
        error: 'You need to configure your own PiShock credentials to send commands' 
      });
    }

    let executorCreds;
    try {
      executorCreds = await decrypt(executorData.credentials);
      console.log('EXECUTE: Executor credentials found, username:', executorCreds.username);
    } catch (error) {
      console.error('EXECUTE: Failed to decrypt executor credentials:', error);
      return jsonResponse({ 
        success: false, 
        error: 'Failed to decrypt your PiShock credentials' 
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

    try {
      // Use the target user's selected shocker if available
      const selectedShockerId = targetUserData.selectedShockerId;
      let targetShocker: any = null;
      let deviceWithShockers: any = null;
      
      if (selectedShockerId) {
        console.log('EXECUTE: Using pre-selected shocker ID:', selectedShockerId);
        
        // We need to validate the shocker still exists and get device info
        console.log('EXECUTE: Getting target user devices to validate selected shocker...');
        const devicesUrl = `https://ps.pishock.com/PiShock/GetUserDevices?userId=${targetCreds.piShockUserId || 0}&token=${encodeURIComponent(targetCreds.apiKey)}&api=true`;
        
        const devicesResponse = await fetch(devicesUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'PiShock-Discord-Activity/2.0',
            'Accept': 'application/json'
          }
        });

        if (!devicesResponse.ok) {
          throw new Error(`Failed to get target devices: HTTP ${devicesResponse.status}`);
        }

        const devicesText = await devicesResponse.text();
        let devices;
        try {
          devices = JSON.parse(devicesText);
        } catch (parseError) {
          throw new Error('Failed to parse devices response');
        }

        if (!Array.isArray(devices) || devices.length === 0) {
          throw new Error('Target user has no devices available');
        }

        // Find the device that contains the selected shocker
        let shockerFound = false;
        for (const device of devices) {
          if (device.shockers && Array.isArray(device.shockers)) {
            const foundShocker = device.shockers.find((shocker: any) => 
              shocker.shockerId.toString() === selectedShockerId.toString()
            );
            if (foundShocker) {
              deviceWithShockers = device;
              targetShocker = foundShocker;
              shockerFound = true;
              console.log('EXECUTE: Found selected shocker ID:', targetShocker.shockerId, 'in device:', deviceWithShockers.clientId);
              break;
            }
          }
        }

        if (!shockerFound) {
          console.warn('EXECUTE: Selected shocker not found, falling back to auto-discovery');
          // Fall back to first available shocker
          deviceWithShockers = devices.find((device: any) => 
            device.shockers && Array.isArray(device.shockers) && device.shockers.length > 0
          );
          if (deviceWithShockers) {
            targetShocker = deviceWithShockers.shockers[0];
            console.log('EXECUTE: Fallback to auto-discovered shocker ID:', targetShocker.shockerId, 'from device:', deviceWithShockers.clientId);
          }
        }
      } else {
        // Fallback to auto-discovery (existing logic)
        console.log('EXECUTE: No pre-selected shocker, using auto-discovery...');
        
        // Get target user's devices first to get their device IDs
        console.log('EXECUTE: Getting target user devices...');
        const devicesUrl = `https://ps.pishock.com/PiShock/GetUserDevices?userId=${targetCreds.piShockUserId || 0}&token=${encodeURIComponent(targetCreds.apiKey)}&api=true`;
        
        const devicesResponse = await fetch(devicesUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'PiShock-Discord-Activity/2.0',
            'Accept': 'application/json'
          }
        });

        if (!devicesResponse.ok) {
          throw new Error(`Failed to get target devices: HTTP ${devicesResponse.status}`);
        }

        const devicesText = await devicesResponse.text();
        let devices;
        try {
          devices = JSON.parse(devicesText);
        } catch (parseError) {
          throw new Error('Failed to parse devices response');
        }

        if (!Array.isArray(devices) || devices.length === 0) {
          throw new Error('Target user has no devices available');
        }

        // Find the first device with shockers
        deviceWithShockers = devices.find((device: any) => 
          device.shockers && Array.isArray(device.shockers) && device.shockers.length > 0
        );

        if (!deviceWithShockers) {
          throw new Error('Target user has no shockers available');
        }

        // Use the first shocker from the first device
        targetShocker = deviceWithShockers.shockers[0];
        console.log('EXECUTE: Using auto-discovered shocker ID:', targetShocker.shockerId, 'from device:', deviceWithShockers.clientId);
      }

      if (!targetShocker) {
        throw new Error('No target shocker available');
      }

      // Execute PiShock command using v3 API
      const operationNames = ['shock', 'vibrate', 'beep'];
      const operationName = operationNames[operation];
      
      console.log('EXECUTE: Sending', operationName, 'command via v3 API');
      
      // Determine what code to use - prioritize selectedSharecode if available
      let codeToUse;
      let codeType;
      
      if (targetUserData.selectedSharecode) {
        // The selectedSharecode is actually a share ID, we need to get the actual shareCode
        console.log('EXECUTE: Getting actual shareCode for share ID:', targetUserData.selectedSharecode);
        
        try {
          // First get the target user's user ID (not executor's!)
          const authUrl = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(targetCreds.apiKey)}&username=${encodeURIComponent(targetCreds.username)}`;
          const authResponse = await fetch(authUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'PiShock-Discord-Activity/2.0',
              'Accept': 'application/json'
            }
          });
          
          if (!authResponse.ok) {
            throw new Error('Failed to authenticate target user');
          }
          
          const authData = await authResponse.json();
          if (!authData || !authData.UserId) {
            throw new Error('Failed to get target user ID');
          }
          
          const targetPiShockUserId = authData.UserId;
          
          // Get detailed shocker info for this share ID using TARGET user's credentials
          const sharecodesUrl = `https://ps.pishock.com/PiShock/GetShockersByShareIds?UserId=${targetPiShockUserId}&Token=${encodeURIComponent(targetCreds.apiKey)}&shareIds=${encodeURIComponent(targetUserData.selectedSharecode)}&api=true`;
          
          const sharecodesResponse = await fetch(sharecodesUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'PiShock-Discord-Activity/2.0',
              'Accept': 'application/json'
            }
          });
          
          if (sharecodesResponse.ok) {
            const sharecodesData = await sharecodesResponse.json();
            console.log('EXECUTE: Sharecodes response:', sharecodesData);
            
            // Extract the actual shareCode from the response
            let actualShareCode = null;
            if (sharecodesData && typeof sharecodesData === 'object') {
              // Response format: {"username": [shocker objects...]}
              Object.values(sharecodesData).forEach((shockers: any) => {
                if (Array.isArray(shockers)) {
                  shockers.forEach((shocker: any) => {
                    if (shocker.shareId && shocker.shareId.toString() === targetUserData.selectedSharecode.toString()) {
                      actualShareCode = shocker.shareCode;
                      console.log('EXECUTE: Found actual shareCode:', actualShareCode, 'for share ID:', shocker.shareId);
                    }
                  });
                }
              });
            }
            
            if (actualShareCode) {
              codeToUse = actualShareCode;
              codeType = 'sharecode';
              console.log('EXECUTE: Using actual shareCode:', codeToUse);
            } else {
              console.warn('EXECUTE: Could not find actual shareCode, falling back to share ID');
              codeToUse = targetUserData.selectedSharecode;
              codeType = 'sharecode_fallback';
            }
          } else {
            console.warn('EXECUTE: Failed to get detailed shocker info, using share ID as fallback');
            codeToUse = targetUserData.selectedSharecode;
            codeType = 'sharecode_fallback';
          }
        } catch (error) {
          console.error('EXECUTE: Error getting detailed shocker info:', error);
          codeToUse = targetUserData.selectedSharecode;
          codeType = 'sharecode_fallback';
        }
      } else if (targetShocker) {
        codeToUse = targetShocker.shockerId.toString();
        codeType = 'shocker';
        console.log('EXECUTE: Using shocker ID:', codeToUse);
      } else {
        throw new Error('No code available for execution');
      }
      
      // Use the v3 API Operate endpoint with form data
      const payload = {
        code: codeToUse,
        duration: duration.toString(),
        intensity: intensity.toString(),
        op: operation.toString(),
        apikey: executorCreds.apiKey,
        username: executorCreds.username,
        name: 'DiscordActivity-v3',
        random: 'false',
        scale: 'false'
      };
      
      console.log('EXECUTE: Request payload:', { 
        code: codeToUse,
        codeType,
        duration: duration.toString(),
        intensity: intensity.toString(),
        op: operation.toString(),
        apikey: '***HIDDEN***',
        username: executorCreds.username,
        name: 'DiscordActivity-v3',
        random: 'false',
        scale: 'false'
      });
      
      const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'PiShock-Discord-Activity/2.0'
        },
        body: new URLSearchParams(payload)
      });

      console.log('EXECUTE: Response status:', response.status);
      
      const responseText = await response.text();
      console.log('EXECUTE: Response text:', responseText);

      if (!response.ok) {
        throw new Error(`PiShock API error: HTTP ${response.status} - ${responseText}`);
      }

      // Check for success responses (v3 API may return different success indicators)
      if (response.status === 200) {
        console.log('EXECUTE: ✓ Command executed successfully via v3 API');
      } else {
        console.log('EXECUTE: Warning - unexpected response but will proceed:', responseText);
      }

      // Get user info for logging
      const executorUserData = await env.PISHOCK_KV.get(`discord_user:${executorUserId}`);
      const executorUser = executorUserData ? JSON.parse(executorUserData) : null;
      
      const targetUserDiscordData = await env.PISHOCK_KV.get(`discord_user:${targetUserId}`);
      const targetUser = targetUserDiscordData ? JSON.parse(targetUserDiscordData) : null;

      // Create activity log entry
      const logEntry: ActivityLogEntry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        instanceId: 'global', // Global activity log for user-to-user actions
        executorUserId,
        executorUsername: executorUser?.global_name || executorUser?.username || 'Unknown User',
        executorAvatar: executorUser?.avatar ? `https://cdn.discordapp.com/avatars/${executorUserId}/${executorUser.avatar}.png` : undefined,
        targetUserId,
        targetUsername: targetUser?.global_name || targetUser?.username || 'Unknown User',
        targetAvatar: targetUser?.avatar ? `https://cdn.discordapp.com/avatars/${targetUserId}/${targetUser.avatar}.png` : undefined,
        action: operationName as 'shock' | 'vibrate' | 'beep',
        intensity,
        duration,
      };

      // Store activity log entry
      await addToActivityBatch(env.PISHOCK_KV, logEntry);

      console.log('EXECUTE: Activity logged with ID:', logEntry.id);

      return jsonResponse({ 
        success: true, 
        logEntryId: logEntry.id,
        message: `${operationName} command executed successfully via v3 API`,
        debug: {
          targetShockerId: targetShocker.shockerId,
          deviceId: deviceWithShockers?.clientId,
          maxIntensity,
          maxDuration,
          response: responseText,
          usedSelectedShocker: !!selectedShockerId
        }
      });

    } catch (error) {
      console.error('EXECUTE: PiShock execution failed:', error);
      return jsonResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Command execution failed' 
      });
    }
  } catch (error) {
    console.error('EXECUTE: User PiShock execute error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};