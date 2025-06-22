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

async function addToActivityIndex(kv: KVNamespace, key: string) {
  try {
    const indexKey = 'activity:index';
    let index = await kv.get(indexKey);
    let arr: string[] = index ? JSON.parse(index) : [];
    
    // Add new entry at the beginning (newest first)
    arr.unshift(key);
    
    // Limit index size to prevent unbounded growth
    if (arr.length > 5000) {
      const removedKeys = arr.slice(5000);
      arr = arr.slice(0, 5000);
      
      // Clean up old entries in background
      for (const oldKey of removedKeys) {
        await kv.delete(oldKey);
      }
    }
    
    await kv.put(indexKey, JSON.stringify(arr));
  } catch (error) {
    console.error('Failed to update activity index:', error);
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
      
      // Validate token
      const user = await validateDiscordToken(token);
      if (!user) return new Response('Invalid token', { status: 401 });

      const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
      const offset = parseInt(searchParams.get('offset') || '0', 10);
      const since = searchParams.get('since');

      let index = await env.PISHOCK_KV.get('activity:index');
      let arr: string[] = index ? JSON.parse(index) : [];

      if (since) {
        const sinceDate = new Date(since);
        arr = arr.filter((key: string) => {
          const timestamp = key.split(':')[2];
          return new Date(timestamp) > sinceDate;
        });
      }

      const total = arr.length;
      const entries: ActivityLogEntry[] = [];

      for (let i = offset; i < Math.min(offset + limit, arr.length); i++) {
        try {
          const entryData = await env.PISHOCK_KV.get(arr[i]);
          if (entryData) {
            entries.push(JSON.parse(entryData));
          }
        } catch (error) {
          console.error(`Failed to parse entry ${arr[i]}:`, error);
        }
      }

      return jsonResponse({ 
        entries, 
        total, 
        hasMore: offset + limit < arr.length 
      });
    }

    if (method === 'POST') {
      const token = await requireAuth(request);
      if (!token) return new Response('Unauthorized', { status: 401 });
      
      const user = await validateDiscordToken(token);
      if (!user) return new Response('Invalid token', { status: 401 });

      const entry = await request.json();
      const id = uuidv4();
      const timestamp = new Date().toISOString();
      const key = `activity:log:${timestamp}:${id}`;
      
      const logEntry: ActivityLogEntry = { 
        ...entry, 
        id, 
        timestamp 
      };

      await env.PISHOCK_KV.put(key, JSON.stringify(logEntry));
      await addToActivityIndex(env.PISHOCK_KV, key);

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