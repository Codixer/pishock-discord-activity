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

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    const { targetUserId, intensity, duration, operation } = await request.json();

    if (!targetUserId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters' 
      }, 400);
    }

    const encrypted = await env.PISHOCK_KV.get(`instance:${instanceId}:pishock`);
    if (!encrypted) {
      return jsonResponse({ 
        success: false, 
        error: 'No PiShock credentials configured for this instance' 
      });
    }

    try {
      const creds = await decrypt(encrypted);
      
      const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: creds.username,
          apikey: creds.apiKey,
          code: creds.sharecode,
          intensity: intensity,
          duration: duration,
          op: operation,
          name: 'DiscordActivity',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PiShock API error: ${errorText}`);
      }

      const executorInfo = await getUserInfo(token, user.id);
      const targetInfo = await getUserInfo(token, targetUserId);

      // Create activity log entry for this session
      const logEntry: ActivityLogEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        instanceId,
        executorUserId: user.id,
        executorUsername: executorInfo?.username || user.global_name || user.username || 'Unknown User',
        executorAvatar: executorInfo?.avatar || (user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : undefined),
        targetUserId,
        targetUsername: targetInfo?.username || 'Unknown User',
        targetAvatar: targetInfo?.avatar,
        action: ['shock', 'vibrate', 'beep'][operation] as 'shock' | 'vibrate' | 'beep',
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
        logEntryId: logEntry.id
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
