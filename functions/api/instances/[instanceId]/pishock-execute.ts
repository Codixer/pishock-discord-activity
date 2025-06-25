import { validateDiscordToken, getUserInfo } from '../../../lib/discord-auth';

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

import { decrypt } from '../../../lib/pishock-api';

async function addToActivityBatch(kv: KVNamespace, entry: ActivityLogEntry) {
  try {
    console.log('INSTANCE_ACTIVITY_LOG: Adding entry to batch for date:', new Date(entry.timestamp).toISOString().split('T')[0]);
    
    // Use date-based batching to reduce key count
    const date = new Date(entry.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD
    const batchKey = `activity:batch:${date}`;
    
    console.log('INSTANCE_ACTIVITY_LOG: Using batch key:', batchKey);
    
    let batch = await kv.get(batchKey);
    let batchData = batch ? JSON.parse(batch) : {
      entries: [],
      lastUpdated: entry.timestamp,
      totalCount: 0
    };
    
    console.log('INSTANCE_ACTIVITY_LOG: Current batch has', batchData.entries.length, 'entries');
    
    // Add new entry at the beginning (newest first)
    batchData.entries.unshift(entry);
    batchData.lastUpdated = entry.timestamp;
    batchData.totalCount++;
    
    console.log('INSTANCE_ACTIVITY_LOG: Added entry, batch now has', batchData.entries.length, 'entries');
    
    // Limit entries per batch to prevent value size issues
    if (batchData.entries.length > 200) {
      batchData.entries = batchData.entries.slice(0, 200);
      console.log('INSTANCE_ACTIVITY_LOG: Trimmed batch to 200 entries');
    }
    
    // Store with 30-day TTL to auto-cleanup old logs
    await kv.put(batchKey, JSON.stringify(batchData), { expirationTtl: 2592000 });
    console.log('INSTANCE_ACTIVITY_LOG: ✓ Successfully stored batch with', batchData.entries.length, 'entries');
  } catch (error) {
    console.error('Failed to update activity batch:', error);
    throw error; // Re-throw to ensure calling code knows about the failure
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

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) return new Response('Invalid token', { status: 401 });

  try {
    const { targetUserId, intensity, duration, operation } = await request.json();

    // Validate parameters
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
      
      // Execute PiShock command
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

      // Get user info for logging with fallback to Discord API
      console.log('INSTANCE EXECUTE: Getting user info for activity log...');
      const executorInfo = await getUserInfo(env.PISHOCK_KV, user.id, token);
      const targetInfo = await getUserInfo(env.PISHOCK_KV, targetUserId, token);

      // Create activity log entry
      const logEntry: ActivityLogEntry = {
        id: uuidv4(),
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

      // Store activity log entry
      // Store activity log entry (blocking to ensure logging works)
      try {
        console.log('INSTANCE EXECUTE: Logging activity entry with ID:', logEntry.id);
        await addToActivityBatch(env.PISHOCK_KV, logEntry);
        console.log('INSTANCE EXECUTE: ✓ Activity logged successfully');
      } catch (logError) {
        console.error('INSTANCE EXECUTE: ❌ Failed to log activity (CRITICAL):', logError);
        // Don't fail the entire operation, but log the error clearly
      }

      return jsonResponse({ 
        success: true, 
        logEntryId: logEntry.id 
      });

    } catch (error) {
      console.error('PiShock execution failed:', error);
      return jsonResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Command execution failed' 
      });
    }
  } catch (error) {
    console.error('PiShock execute error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};