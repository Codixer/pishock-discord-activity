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
      'Cache-Control': 'no-cache',
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
  const { request, env } = context;
  const url = new URL(request.url);
  const { searchParams } = url;
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

  try {
    if (method === 'GET') {
      const token = await requireAuth(request);
      if (!token) return new Response('Unauthorized', { status: 401 });
      
      const user = await validateDiscordToken(token);
      if (!user) return new Response('Invalid token', { status: 401 });

      const instanceId = searchParams.get('instanceId');
      if (!instanceId) {
        return jsonResponse({ 
          error: 'instanceId parameter required' 
        }, 400);
      }

      // Retrieve session-specific activity log
      const logKey = `session:${instanceId}:activity_log`;
      const logData = await env.PISHOCK_KV.get(logKey);
      
      if (!logData) {
        return jsonResponse({ 
          entries: [], 
          total: 0,
          sessionStart: null,
          lastActivity: null
        });
      }

      const sessionLog: SessionActivityLog = JSON.parse(logData);
      
      return jsonResponse({ 
        entries: sessionLog.entries,
        total: sessionLog.totalCount,
        sessionStart: sessionLog.sessionStart,
        lastActivity: sessionLog.lastActivity
      });
    }

    if (method === 'POST') {
      const token = await requireAuth(request);
      if (!token) return new Response('Unauthorized', { status: 401 });
      
      const user = await validateDiscordToken(token);
      if (!user) return new Response('Invalid token', { status: 401 });

      const entry = await request.json();
      
      if (!entry.instanceId) {
        return jsonResponse({ 
          error: 'instanceId required in log entry' 
        }, 400);
      }

      const id = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      
      const logEntry: ActivityLogEntry = { 
        ...entry, 
        id, 
        timestamp 
      };

      await addToSessionLog(env.PISHOCK_KV, logEntry);

      return jsonResponse({ success: true, entryId: id });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('Activity log error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};