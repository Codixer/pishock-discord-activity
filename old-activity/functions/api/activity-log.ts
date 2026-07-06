import { v4 as uuidv4 } from 'uuid';
import { ACTIVITY_BATCH_KV_TTL_SECONDS } from './_shared/activity-batch-kv';

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

async function addToActivityBatch(kv: KVNamespace, entry: ActivityLogEntry) {
  try {
    const date = new Date(entry.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
    const batchKey = `activity:batch:${date}`;
    
    let batch = await kv.get(batchKey);
    let batchData: BatchedActivityLog = batch ? JSON.parse(batch) : {
      entries: [],
      lastUpdated: entry.timestamp,
      totalCount: 0
    };
    
    batchData.entries.unshift(entry);
    batchData.lastUpdated = entry.timestamp;
    batchData.totalCount++;
    
    // Limit entries per batch to prevent value size issues
    // Increased from 150 to 500 to reduce write frequency
    if (batchData.entries.length > 500) {
      batchData.entries = batchData.entries.slice(0, 500);
    }
    
    await kv.put(batchKey, JSON.stringify(batchData), { expirationTtl: ACTIVITY_BATCH_KV_TTL_SECONDS });
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
      const user = await validateDiscordToken(token, env.PISHOCK_KV);
      if (!user) return new Response('Invalid token', { status: 401 });

      const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
      const offset = parseInt(searchParams.get('offset') || '0', 10);
      const since = searchParams.get('since');

      const today = new Date();
      let batches: ActivityLogEntry[] = [];
      
      for (let i = 0; i < 30; i++) {
        const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        const batchKey = `activity:batch:${dateStr}`;
        
        try {
          const batchData = await env.PISHOCK_KV.get(batchKey);
          if (batchData) {
            const batch: BatchedActivityLog = JSON.parse(batchData);
            batches.push(...batch.entries);
          }
        } catch (error) {
          console.warn(`Failed to load batch ${dateStr}:`, error);
        }
      }
      
      batches.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (since) {
        const sinceDate = new Date(since);
        batches = batches.filter(entry => new Date(entry.timestamp) > sinceDate);
      }

      const total = batches.length;
      const entries = batches.slice(offset, offset + limit);
      
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