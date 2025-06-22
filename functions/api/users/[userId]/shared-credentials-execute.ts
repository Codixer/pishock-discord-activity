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
  sharedCredentialsUsed?: boolean;
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
  const executorUserId = params.userId as string;

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

  // Users can only execute commands as themselves
  if (user.id !== executorUserId) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const { targetUserId, intensity, duration, operation } = await request.json();

    console.log('=== SHARED CREDENTIALS EXECUTION ===');
    console.log('SHARED_EXEC: Executor user:', executorUserId);
    console.log('SHARED_EXEC: Target user:', targetUserId);
    console.log('SHARED_EXEC: Operation:', operation, '(0=shock, 1=vibrate, 2=beep)');
    console.log('SHARED_EXEC: Intensity:', intensity);
    console.log('SHARED_EXEC: Duration:', duration);

    // Validate parameters
    if (!targetUserId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      console.error('SHARED_EXEC: Invalid parameters');
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters' 
      }, 400);
    }

    // Check if executor has consented to use shared credentials
    const consentData = await env.PISHOCK_KV.get(`user:${executorUserId}:shared_consent`);
    if (!consentData) {
      console.error('SHARED_EXEC: Executor has not consented to shared credentials');
      return jsonResponse({ 
        success: false, 
        error: 'You have not consented to use shared credentials' 
      });
    }

    // Check if shared credentials are available
    const sharedApiKey = env.PISHOCK_RELAY_API_KEY;
    const sharedUsername = env.PISHOCK_RELAY_USERNAME;

    console.log('SHARED_EXEC: Shared credentials status:');
    console.log('SHARED_EXEC: Has shared API key:', !!sharedApiKey);
    console.log('SHARED_EXEC: Has shared username:', !!sharedUsername);

    if (!sharedApiKey || !sharedUsername) {
      console.error('SHARED_EXEC: Shared credentials not configured in environment variables');
      return jsonResponse({ 
        success: false, 
        error: 'Shared credentials not configured - missing environment variables' 
      });
    }

    // Get target user's PiShock credentials - we need their share code to control their device
    console.log('SHARED_EXEC: Getting target user credentials...');
    
    // Debug: Check all possible data locations for target user
    console.log('SHARED_EXEC: Checking data locations for target user:', targetUserId);
    const debugKeys = [
      `user:${targetUserId}:data`,
      `user:${targetUserId}:pishock`,
      `instance:${targetUserId}:pishock`
    ];
    
    for (const key of debugKeys) {
      const data = await env.PISHOCK_KV.get(key);
      console.log(`SHARED_EXEC: Key "${key}":`, data ? 'EXISTS' : 'NOT_FOUND');
    }
    
    const userDataStr = await env.PISHOCK_KV.get(`user:${targetUserId}:data`);
    let userData = userDataStr ? JSON.parse(userDataStr) : null;
    let encrypted = userData?.credentials;
    
    console.log('SHARED_EXEC: New format check:', {
      userDataFound: !!userData,
      credentialsFound: !!encrypted,
      userDataKeys: userData ? Object.keys(userData) : []
    });
    
    // Migration: Check old format if new format not found
    if (!encrypted) {
      console.log('SHARED_EXEC: Checking old format for user:', targetUserId);
      const oldEncrypted = await env.PISHOCK_KV.get(`user:${targetUserId}:pishock`);
      if (oldEncrypted) {
        console.log('SHARED_EXEC: Found data in old format, migrating...');
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
        console.log('SHARED_EXEC: Migration completed for user:', targetUserId);
      } else {
        console.log('SHARED_EXEC: No data found in old format either');
      }
    }

    if (!encrypted) {
      console.error('SHARED_EXEC: No encrypted credentials found for target user:', targetUserId);
      
      // List all keys that might be related to this user
      const userKeys = await env.PISHOCK_KV.list({ prefix: `user:${targetUserId}` });
      console.log('SHARED_EXEC: Available keys for user:', userKeys.keys.map(k => k.name));
      
      return jsonResponse({ 
        success: false, 
        error: `Target user has no PiShock device configured. They need to set up their PiShock credentials first in the application settings.`,
        debug: {
          targetUserId,
          userDataFound: !!userData,
          encryptedFound: !!encrypted,
          availableKeys: userKeys.keys.map(k => k.name)
        }
      });
    }

    let targetCreds;
    try {
      targetCreds = await decrypt(encrypted);
      
      console.log('SHARED_EXEC: Target user credentials decrypted');
      console.log('SHARED_EXEC: Target username:', targetCreds.username);
      console.log('SHARED_EXEC: Target share code:', targetCreds.sharecode ? `${targetCreds.sharecode.slice(0, 4)}****` : 'MISSING');
      console.log('SHARED_EXEC: Target has own device:', targetCreds.hasOwnDevice);
      
      if (!targetCreds.sharecode || targetCreds.sharecode === 'account_access') {
        console.error('SHARED_EXEC: Target user has no device configured (account-only access)');
        return jsonResponse({ 
          success: false, 
          error: 'Target user has no device configured (account-only access). Cannot send commands to users without devices.' 
        });
      }
    } catch (error) {
      console.error('SHARED_EXEC: Failed to decrypt target user credentials:', error);
      return jsonResponse({ 
        success: false, 
        error: 'Failed to decrypt target user credentials' 
      });
    }

    try {
      // Use shared bot credentials to control target user's device
      const operationNames = ['shock', 'vibrate', 'beep'];
      const operationName = operationNames[operation];
      
      console.log('SHARED_EXEC: Executing', operationName, 'command via shared bot credentials');
      console.log('SHARED_EXEC: Using shared bot credentials to control target device');
      
      const payload = {
        Username: sharedUsername,        // Shared bot username
        Apikey: sharedApiKey,           // Shared bot API key
        Code: targetCreds.sharecode,    // Target user's device share code
        Intensity: intensity,
        Duration: duration,
        Op: operation,
        Name: 'DiscordActivity-SharedBot',
      };
      
      console.log('SHARED_EXEC: Request payload:', { 
        Username: sharedUsername,
        Apikey: '***HIDDEN***',
        Code: targetCreds.sharecode ? `${targetCreds.sharecode.slice(0, 4)}****` : 'MISSING',
        Intensity: intensity,
        Duration: duration,
        Op: operation,
        Name: 'DiscordActivity-SharedBot'
      });
      
      const response = await fetch('https://do.pishock.com/api/apioperate/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'PiShock-Discord-Activity-SharedBot/1.0'
        },
        body: JSON.stringify(payload),
      });

      console.log('SHARED_EXEC: Response status:', response.status);
      
      const responseText = await response.text();
      console.log('SHARED_EXEC: Response text:', responseText);

      if (!response.ok) {
        console.error('SHARED_EXEC: HTTP error:', response.status, responseText);
        throw new Error(`PiShock API error: HTTP ${response.status} - ${responseText}`);
      }

      // Check for success responses as per Legacy API documentation
      let commandSuccessful = false;
      
      if (responseText.includes('Operation Succeeded')) {
        console.log('SHARED_EXEC: ✅ Command executed successfully (Operation Succeeded)');
        commandSuccessful = true;
      } else if (response.status === 200 && responseText.trim().length === 0) {
        console.log('SHARED_EXEC: ✅ Command executed successfully (HTTP 200 with empty response)');
        commandSuccessful = true;
      } else if (response.status === 200) {
        console.log('SHARED_EXEC: ✅ Command executed successfully (HTTP 200)');
        commandSuccessful = true;
      } else {
        // Check for specific error messages from documentation
        if (responseText.includes("This code doesn't exist")) {
          console.error('SHARED_EXEC: ❌ Share code not found');
          throw new Error('Target user\'s share code not found. They may need to regenerate it.');
        } else if (responseText.includes('Not Authorized')) {
          console.error('SHARED_EXEC: ❌ Not authorized - shared credentials invalid');
          throw new Error('Shared bot credentials are invalid. Please contact support.');
        } else if (responseText.includes('Shocker is Paused')) {
          console.error('SHARED_EXEC: ❌ Device is paused');
          throw new Error('Target device is paused. Ask them to unpause it in the PiShock web panel.');
        } else if (responseText.includes('Device currently not connected')) {
          console.error('SHARED_EXEC: ❌ Device not connected');
          throw new Error('Target device is not connected. Ask them to ensure their device is online.');
        } else if (responseText.includes('already been used by somebody else')) {
          console.error('SHARED_EXEC: ❌ Share code already in use');
          throw new Error('Target user\'s share code is already in use. They need to generate a new one.');
        } else if (responseText.includes('Unknown Op')) {
          console.error('SHARED_EXEC: ❌ Invalid operation');
          throw new Error('Invalid operation specified.');
        } else if (responseText.includes('Intensity must be between')) {
          console.error('SHARED_EXEC: ❌ Invalid intensity');
          throw new Error('Invalid intensity specified.');
        } else if (responseText.includes('Duration must be between')) {
          console.error('SHARED_EXEC: ❌ Invalid duration');
          throw new Error('Invalid duration specified.');
        } else {
          console.log('SHARED_EXEC: ⚠️ Unknown response, assuming success:', responseText);
          commandSuccessful = true;
        }
      }

      if (!commandSuccessful) {
        throw new Error(`Command execution failed: ${responseText}`);
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
        instanceId: 'shared', // Special instance ID for shared credentials commands
        executorUserId,
        executorUsername: executorUser?.global_name || executorUser?.username || 'Unknown User',
        executorAvatar: executorUser?.avatar ? `https://cdn.discordapp.com/avatars/${executorUserId}/${executorUser.avatar}.png` : undefined,
        targetUserId,
        targetUsername: targetUser?.global_name || targetUser?.username || 'Unknown User',
        targetAvatar: targetUser?.avatar ? `https://cdn.discordapp.com/avatars/${targetUserId}/${targetUser.avatar}.png` : undefined,
        action: operationName as 'shock' | 'vibrate' | 'beep',
        intensity,
        duration,
        sharedCredentialsUsed: true,
      };

      // Store activity log entry
      await addToActivityBatch(env.PISHOCK_KV, logEntry);

      console.log('SHARED_EXEC: ✅ Activity logged with ID:', logEntry.id);
      console.log('SHARED_EXEC: Command execution completed successfully');

      return jsonResponse({ 
        success: true, 
        logEntryId: logEntry.id,
        sharedCredentialsUsed: true,
        message: `${operationName} command sent to ${targetUser?.global_name || targetUser?.username || 'target user'}'s device via shared bot credentials`,
        debug: {
          method: 'shared_bot_credentials',
          targetUsername: targetCreds.username,
          targetDevice: targetCreds.sharecode ? `${targetCreds.sharecode.slice(0, 4)}****` : 'MISSING',
          response: responseText
        }
      });

    } catch (error) {
      console.error('SHARED_EXEC: PiShock execution failed:', error);
      return jsonResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Command execution failed',
        debug: {
          method: 'shared_bot_credentials',
          sharedCredentialsConfigured: !!(sharedApiKey && sharedUsername),
          targetConfigured: !!(targetCreds?.sharecode && targetCreds?.sharecode !== 'account_access'),
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        }
      });
    }
  } catch (error) {
    console.error('SHARED_EXEC: General error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};