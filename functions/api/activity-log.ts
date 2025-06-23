import { v4 as uuidv4 } from 'uuid';

interface Env {
  PISHOCK_KV: KVNamespace;
}

interface BatchedActivityLog {
  entries: ActivityLogEntry[];
  lastUpdated: string;
  totalCount: number;
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
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=15', // 30 seconds cache for activity
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

async function addToActivityBatch(kv: KVNamespace, entry: ActivityLogEntry) {
  try {
    // Use date-based batching to reduce key count
    const date = new Date(entry.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
    const batchKey = `activity:batch:${date}`;
    
    let batch = await kv.get(batchKey);
    let batchData: BatchedActivityLog = batch ? JSON.parse(batch) : {
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

      // Get recent batches (last 30 days)
      const today = new Date();
      let batches: ActivityLogEntry[] = [];
      
      for (let i = 0; i < 30; i++) {
        const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        const batchKey = `activity:batch:${dateStr}`;
        
        console.log('ACTIVITY_LOG_READ: Checking batch for date:', dateStr, 'key:', batchKey);
        
        try {
          const batchData = await env.PISHOCK_KV.get(batchKey);
          if (batchData) {
            const batch: BatchedActivityLog = JSON.parse(batchData);
            batches.push(...batch.entries);
            console.log('ACTIVITY_LOG_READ: Found batch with', batch.entries.length, 'entries for', dateStr);
          } else {
            console.log('ACTIVITY_LOG_READ: No batch found for', dateStr);
          }
        } catch (error) {
          console.warn(`Failed to load batch ${dateStr}:`, error);
        }
      }
      
      // Sort by timestamp (newest first)
      batches.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      console.log('ACTIVITY_LOG_READ: Total entries found across all batches:', batches.length);
      
      if (since) {
        const sinceDate = new Date(since);
        batches = batches.filter(entry => new Date(entry.timestamp) > sinceDate);
        console.log('ACTIVITY_LOG_READ: After filtering by since date:', batches.length, 'entries');
      }

      const total = batches.length;
      const entries = batches.slice(offset, offset + limit);
      
      console.log('ACTIVITY_LOG_READ: Returning', entries.length, 'entries (total:', total, ', offset:', offset, ', limit:', limit, ')');

      return jsonResponse({ 
        entries, 
        total, 
        hasMore: offset + limit < batches.length 
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
      
      const logEntry: ActivityLogEntry = { 
        ...entry, 
        id, 
        timestamp 
      };

      await addToActivityBatch(env.PISHOCK_KV, logEntry);

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