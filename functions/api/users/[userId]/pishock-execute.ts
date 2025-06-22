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

    console.log('EXECUTE: Starting PiShock command execution');
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

    // First, let's check what data exists for this user
    console.log('EXECUTE: Checking all possible data locations for user:', targetUserId);
    
    // Check all possible keys for this user
    const possibleKeys = [
      `user:${targetUserId}:data`,
      `user:${targetUserId}:pishock`,
      `user:${targetUserId}:pishock:credentials`,
      `discord_user:${targetUserId}`,
      `instance:${targetUserId}:pishock`
    ];
    
    for (const key of possibleKeys) {
      const data = await env.PISHOCK_KV.get(key);
      console.log(`EXECUTE: Key "${key}":`, data ? 'EXISTS' : 'NOT FOUND');
      if (data && key.includes('data')) {
        try {
          const parsed = JSON.parse(data);
          console.log(`EXECUTE: Parsed data for "${key}":`, {
            hasCredentials: !!parsed.credentials,
            hasOldFormat: !!parsed.apiKey,
            keys: Object.keys(parsed)
          });
        } catch (e) {
          console.log(`EXECUTE: Failed to parse data for "${key}":`, e.message);
        }
      }
    }
    // Get target user's PiShock credentials
    // Get all user data from single key (new format)
    console.log('EXECUTE: Looking for credentials for target user:', targetUserId);
    const userDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
    let userData = userDataStr ? JSON.parse(userDataStr) : null;
    let encrypted = userData?.credentials;
    
    console.log('EXECUTE: User data found:', !!userData);
    console.log('EXECUTE: Credentials found in new format:', !!encrypted);
    if (userData) {
      console.log('EXECUTE: User data structure:', Object.keys(userData));
    }
    
    // Migration: Check old format if new format not found
    if (!encrypted) {
      console.log('EXECUTE: Checking old format for user:', targetUserId);
      const oldEncrypted = await env.PISHOCK_KV.get(`user:${targetUserId}:pishock`);
      if (oldEncrypted) {
        console.log('EXECUTE: Found data in old format, migrating...');
        // Migrate old data to new format
        userData = {
          credentials: oldEncrypted,
          lastTested: await env.PISHOCK_KV.get(`user:${targetUserId}:pishock:lastTested`) || new Date().toISOString(),
          configuredBy: await env.PISHOCK_KV.get(`user:${targetUserId}:pishock:configuredBy`) || 'unknown',
          hasOwnDevice: (await env.PISHOCK_KV.get(`user:${targetUserId}:pishock:hasOwnDevice`)) === 'true',
          piShockUserId: await env.PISHOCK_KV.get(`user:${targetUserId}:pishock:piShockUserId`) || null,
          lastUpdated: new Date().toISOString()
        };
        
        // Save in new format
        await env.PISHOCK_KV.put(`user:${targetUserId}:data`, JSON.stringify(userData));
        
        // Clean up old keys
        await Promise.all([
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock`),
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock:lastTested`),
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock:configuredBy`),
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock:hasOwnDevice`),
          env.PISHOCK_KV.delete(`user:${targetUserId}:pishock:piShockUserId`)
        ]);
        
        encrypted = userData.credentials;
        console.log('EXECUTE: Migration completed for user:', targetUserId);
      }
    } else {
      console.log('EXECUTE: Using credentials from new format');
    }
    
    // List all keys with this user ID to see what exists
    const allUserKeys = await env.PISHOCK_KV.list({ prefix: `user:${targetUserId}` });
    console.log('EXECUTE: All keys for user:', allUserKeys.keys.map(k => k.name));
    
    if (!encrypted) {
      console.error('EXECUTE: No credentials found for user:', targetUserId);
      console.error('EXECUTE: Checked keys:', possibleKeys);
      
      return jsonResponse({ 
        success: false, 
        error: `Target user (${targetUserId}) has no PiShock device configured. They need to set up their PiShock credentials first in the application.`,
        debug: {
          targetUserId,
          executorUserId,
          userDataFound: !!userData,
          credentialsFound: !!encrypted,
          checkedKeys: possibleKeys,
          availableUserKeys: allUserKeys?.keys?.map(k => k.name) || []
        }
      });
    }

    try {
      const creds = await decrypt(encrypted);
      console.log('EXECUTE: Successfully decrypted target user credentials');
      console.log('EXECUTE: Username:', creds.username);
      console.log('EXECUTE: Share code:', creds.sharecode);
      
      // Execute PiShock command using Legacy API
      const operationNames = ['shock', 'vibrate', 'beep'];
      const operationName = operationNames[operation];
      
      console.log('EXECUTE: Sending', operationName, 'command via Legacy API');
      
      // Use exact endpoint and format from Legacy API documentation
      const payload = {
        Username: creds.username,
        Apikey: creds.apiKey,
        Code: creds.sharecode,
        Intensity: intensity,
        Duration: duration,
        Op: operation,
        Name: 'DiscordActivity',
      };
      
      console.log('EXECUTE: Request payload:', { ...payload, Apikey: '***' });
      
      const response = await fetch('https://do.pishock.com/api/apioperate/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'PiShock-Discord-Activity/1.0'
        },
        body: JSON.stringify(payload),
      });

      console.log('EXECUTE: Response status:', response.status);
      
      const responseText = await response.text();
      console.log('EXECUTE: Response text:', responseText);

      if (!response.ok) {
        throw new Error(`PiShock API error: HTTP ${response.status} - ${responseText}`);
      }

      // Check for success responses as per Legacy API documentation
      if (responseText.includes('Operation Succeeded')) {
        console.log('EXECUTE: ✓ Command executed successfully');
      } else {
        // Log specific error messages from documentation
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
          console.log('EXECUTE: Warning - unexpected response but will proceed:', responseText);
        }
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
        message: `${operationName} command executed successfully`
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