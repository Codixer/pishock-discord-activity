import { v4 as uuidv4 } from 'uuid';

interface Env {
  PISHOCK_KV: KVNamespace;
  PISHOCK_RELAY_API_KEY?: string;
  PISHOCK_RELAY_USERNAME?: string;
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
  relayUsed?: boolean;
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
    const { executorUserId, targetUserId, intensity, duration, operation } = await request.json();

    // Validate parameters
    if (!executorUserId || !targetUserId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters' 
      }, 400);
    }

    const apiKey = env.PISHOCK_RELAY_API_KEY;
    const username = env.PISHOCK_RELAY_USERNAME;

    if (!apiKey || !username) {
      return jsonResponse({ 
        success: false, 
        error: 'Relay account not configured - missing API key or username' 
      });
    }

    // Get target user's PiShock credentials to get their share code
    const targetUserCredentials = await env.PISHOCK_KV.get(`user:${targetUserId}:pishock`);
    if (!targetUserCredentials) {
      return jsonResponse({ 
        success: false, 
        error: 'Target user has no PiShock device configured' 
      });
    }

    let targetShareCode;
    try {
      const creds = JSON.parse(atob(targetUserCredentials));
      targetShareCode = creds.sharecode;
      
      if (!targetShareCode || targetShareCode === 'account_access') {
        return jsonResponse({ 
          success: false, 
          error: 'Target user has no device configured (account-only access)' 
        });
      }
    } catch (error) {
      return jsonResponse({ 
        success: false, 
        error: 'Failed to decrypt target user credentials' 
      });
    }

    try {
      // Execute PiShock command using relay account credentials but target user's device
      const response = await fetch('https://do.pishock.com/api/apioperate/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Username: username,
          Apikey: apiKey,
          Code: targetShareCode, // Target user's device share code
          Intensity: intensity,
          Duration: duration,
          Op: operation,
          Name: 'DiscordActivity-Relay',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PiShock API error: ${errorText}`);
      }

      // Get user info for logging
      const executorUserData = await env.PISHOCK_KV.get(`discord_user:${executorUserId}`);
      const executorUser = executorUserData ? JSON.parse(executorUserData) : null;
      
      const targetUserData = await env.PISHOCK_KV.get(`discord_user:${targetUserId}`);
      const targetUser = targetUserData ? JSON.parse(targetUserData) : null;

      // Create activity log entry
      const logEntry: ActivityLogEntry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        instanceId: 'relay', // Special instance ID for relay commands
        executorUserId,
        executorUsername: executorUser?.global_name || executorUser?.username || 'Unknown User',
        executorAvatar: executorUser?.avatar ? `https://cdn.discordapp.com/avatars/${executorUserId}/${executorUser.avatar}.png` : undefined,
        targetUserId,
        targetUsername: targetUser?.global_name || targetUser?.username || 'Unknown User',
        targetAvatar: targetUser?.avatar ? `https://cdn.discordapp.com/avatars/${targetUserId}/${targetUser.avatar}.png` : undefined,
        action: ['shock', 'vibrate', 'beep'][operation] as 'shock' | 'vibrate' | 'beep',
        intensity,
        duration,
        relayUsed: true,
      };

      // Store activity log entry
      const logKey = `activity:log:${logEntry.timestamp}:${logEntry.id}`;
      await env.PISHOCK_KV.put(logKey, JSON.stringify(logEntry));
      await addToActivityIndex(env.PISHOCK_KV, logKey);

      return jsonResponse({ 
        success: true, 
        logEntryId: logEntry.id,
        relayUsed: true
      });

    } catch (error) {
      console.error('Relay PiShock execution failed:', error);
      return jsonResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Command execution failed' 
      });
    }
  } catch (error) {
    console.error('Relay execute error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};