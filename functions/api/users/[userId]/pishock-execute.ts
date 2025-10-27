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
}

interface SessionActivityLog {
  entries: ActivityLogEntry[];
  sessionStart: string;
  lastActivity: string;
  totalCount: number;
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
    
    const userData = await response.json();
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

async function getUserInfo(token: string, userId: string): Promise<{ username: string; avatar?: string } | null> {
  try {
    const response = await fetch(`https://discord.com/api/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (response.ok) {
      const user = await response.json();
      return {
        username: user.global_name || user.username || 'Unknown User',
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png` : undefined
      };
    }
  } catch (error) {
    // Silently handle user info errors
  }
  
  return null;
}

// Store activity log per session with 6-hour expiration
async function addToSessionLog(kv: KVNamespace, entry: ActivityLogEntry) {
  try {
    const logKey = `session:${entry.instanceId}:activity_log`;
    
    let existingLog = await kv.get(logKey);
    let sessionLog: SessionActivityLog = existingLog ? JSON.parse(existingLog) : {
      entries: [],
      sessionStart: entry.timestamp,
      lastActivity: entry.timestamp,
      totalCount: 0
    };
    
    sessionLog.entries.unshift(entry);
    sessionLog.lastActivity = entry.timestamp;
    sessionLog.totalCount++;
    
    // Limit to 100 entries per session to prevent value size issues
    if (sessionLog.entries.length > 100) {
      sessionLog.entries = sessionLog.entries.slice(0, 100);
    }
    
    // Store with 6-hour expiration (21600 seconds)
    await kv.put(logKey, JSON.stringify(sessionLog), { expirationTtl: 21600 });
  } catch (error) {
    console.error('Failed to update session activity log:', error);
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

    if (!executorUserId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters' 
      }, 400);
    }

    try {
      const targetUserDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
      if (targetUserDataStr) {
        const targetUserData = JSON.parse(targetUserDataStr);
        const bannedExecutors = targetUserData.bannedExecutors || [];
        
        if (bannedExecutors.includes(executorUserId)) {
          const executorUserData = await env.PISHOCK_KV.get(`discord_user:${executorUserId}`);
          const executorUser = executorUserData ? JSON.parse(executorUserData) : null;
          const executorName = executorUser?.global_name || executorUser?.username || 'Unknown User';
          
          const targetUserData2 = await env.PISHOCK_KV.get(`discord_user:${targetUserId}`);
          const targetUser = targetUserData2 ? JSON.parse(targetUserData2) : null;
          const targetName = targetUser?.global_name || targetUser?.username || 'Unknown User';
          
          return jsonResponse({ 
            success: false, 
            error: `${targetName} has blocked ${executorName} from sending commands to their device.`,
            banned: true,
            executorUserId,
            targetUserId
          }, 403);
        }
      }
    } catch (banCheckError) {
      // Continue with command execution if ban check fails
    }

    const userDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
    let userData = userDataStr ? JSON.parse(userDataStr) : null;
    let encrypted = userData?.credentials;
    
    if (!encrypted) {
      const oldEncrypted = await env.PISHOCK_KV.get(`user:${targetUserId}:pishock`);
      if (oldEncrypted) {
        userData = {
          credentials: oldEncrypted,
          lastTested: await env.PISHOCK_KV.get(`user:${targetUserId}:pishock:lastTested`) || new Date().toISOString(),
          configuredBy: await env.PISHOCK_KV.get(`user:${targetUserId}:pishock:configuredBy`) || 'unknown',
          hasOwnDevice: (await env.PISHOCK_KV.get(`user:${targetUserId}:pishock:hasOwnDevice`)) === 'true',
          piShockUserId: await env.PISHOCK_KV.get(`user:${targetUserId}:pishock:piShockUserId`) || null,
          lastUpdated: new Date().toISOString()
        };
        
        await env.PISHOCK_KV.put(`user:${targetUserId}:data`, JSON.stringify(userData));
        
        await Promise.all([
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock`),
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock:lastTested`),
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock:configuredBy`),
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock:hasOwnDevice`),
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock:piShockUserId`)
        ]);
        
        encrypted = userData.credentials;
      }
    }
    
    if (!encrypted) {
      return jsonResponse({ 
        success: false, 
        error: `Target user (${targetUserId}) has no PiShock device configured. They need to set up their PiShock credentials first in the application.`,
      });
    }

    try {
      const creds = await decrypt(encrypted);
      
      const targetMaxIntensity = creds.maxIntensity || 100;
      const targetMaxDuration = creds.maxDuration || 15;
      
      if (intensity > targetMaxIntensity) {
        return jsonResponse({ 
          success: false, 
          error: `Intensity ${intensity}% exceeds target user's maximum of ${targetMaxIntensity}%` 
        });
      }
      
      if (duration > targetMaxDuration) {
        return jsonResponse({ 
          success: false, 
          error: `Duration ${duration}s exceeds target user's maximum of ${targetMaxDuration}s` 
        });
      }
      
      const operationNames = ['shock', 'vibrate', 'beep'];
      const operationName = operationNames[operation];
      
      const payload = {
        username: creds.username,
        apikey: creds.apiKey,
        code: creds.sharecode,
        intensity: intensity,
        duration: duration,
        op: operation,
        name: 'DiscordActivity',
      };
      
      const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'PiShock-Discord-Activity/1.0'
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`PiShock API error: HTTP ${response.status} - ${responseText}`);
      }

      if (responseText.includes('Operation Succeeded')) {
        // Command successful
      } else {
        if (responseText.includes("This code doesn't exist")) {
          throw new Error('Share code not found. Please check device configuration.');
        } else if (responseText.includes('Not Authorized')) {
          throw new Error('Not authorized. Please check API credentials.');
        } else if (responseText.includes('Shocker is Paused')) {
          throw new Error('Device is paused. Please unpause it in the PiShock web panel.');
        } else if (responseText.includes('Device currently not connected')) {
          throw new Error('Device is not connected. Please ensure the device is online.');
        } else if (responseText.includes('already been used by somebody else')) {
          throw new Error('Share code is already in use. Please generate a new one.');
        } else if (responseText.includes('Unknown Op')) {
          throw new Error('Invalid operation specified.');
        } else if (responseText.includes('Intensity must be between')) {
          throw new Error('Invalid intensity specified.');
        } else if (responseText.includes('Duration must be between')) {
          throw new Error('Invalid duration specified.');
        } else {
          // Unexpected response but proceed
        }
      }

      const executorInfo = await getUserInfo(token, executorUserId);
      const targetInfo = await getUserInfo(token, targetUserId);

      // Create activity log entry for this session
      const logEntry: ActivityLogEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        instanceId: 'user-session',  // User-level sessions don't have instanceId, use generic identifier
        executorUserId,
        executorUsername: executorInfo?.username || 'Unknown User',
        executorAvatar: executorInfo?.avatar,
        targetUserId,
        targetUsername: targetInfo?.username || 'Unknown User',
        targetAvatar: targetInfo?.avatar,
        action: operationName as 'shock' | 'vibrate' | 'beep',
        intensity,
        duration,
      };

      // Store activity log with 6-hour session expiration
      try {
        await addToSessionLog(env.PISHOCK_KV, logEntry);
      } catch (logError) {
        console.error('Failed to log activity:', logError);
        // Don't fail the request if logging fails
      }

      return jsonResponse({ 
        success: true, 
        logEntryId: logEntry.id,
        message: `${operationName} command executed successfully`
      });

    } catch (error) {
      return jsonResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Command execution failed' 
      });
    }
  } catch (error) {
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};
