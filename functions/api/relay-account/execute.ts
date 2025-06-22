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

async function decrypt(encryptedData: string): Promise<any> {
  try {
    const dataString = atob(encryptedData);
    return JSON.parse(dataString);
  } catch (error) {
    throw new Error('Failed to decrypt data');
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

    console.log('=== RELAY ACCOUNT SHOCK EXECUTION ===');
    console.log('RELAY: Executor user:', executorUserId);
    console.log('RELAY: Target user:', targetUserId);
    console.log('RELAY: Operation:', operation, '(0=shock, 1=vibrate, 2=beep)');
    console.log('RELAY: Intensity:', intensity);
    console.log('RELAY: Duration:', duration);

    // Validate parameters
    if (!executorUserId || !targetUserId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      console.error('RELAY: Invalid parameters');
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters' 
      }, 400);
    }

    const apiKey = env.PISHOCK_RELAY_API_KEY;
    const username = env.PISHOCK_RELAY_USERNAME;

    console.log('RELAY: Checking relay account credentials...');
    console.log('RELAY: Has API key:', !!apiKey);
    console.log('RELAY: Has username:', !!username);
    console.log('RELAY: Username value:', username);

    if (!apiKey || !username) {
      console.error('RELAY: Missing relay account credentials');
      return jsonResponse({ 
        success: false, 
        error: 'Relay account not configured - missing API key or username' 
      });
    }

    // Get target user's PiShock credentials to get their share code
    console.log('RELAY: Getting target user credentials...');
    const targetUserCredentials = await env.PISHOCK_KV.get(`user:${targetUserId}:pishock`);
    if (!targetUserCredentials) {
      console.error('RELAY: Target user has no PiShock device configured');
      return jsonResponse({ 
        success: false, 
        error: 'Target user has no PiShock device configured' 
      });
    }

    let targetShareCode; 
    let targetCreds;
    try {
      targetCreds = await decrypt(targetUserCredentials);
      targetShareCode = targetCreds.sharecode;
      
      console.log('RELAY: Target user credentials decrypted');
      console.log('RELAY: Target username:', targetCreds.username);
      console.log('RELAY: Target share code:', targetShareCode);
      console.log('RELAY: Target has own device:', targetCreds.hasOwnDevice);
      
      if (!targetShareCode || targetShareCode === 'account_access') {
        console.error('RELAY: Target user has no device configured (account-only access)');
        return jsonResponse({ 
          success: false, 
          error: 'Target user has no device configured (account-only access)' 
        });
      }
    } catch (error) {
      console.error('RELAY: Failed to decrypt target user credentials:', error);
      return jsonResponse({ 
        success: false, 
        error: 'Failed to decrypt target user credentials' 
      });
    }

    try {
      // Execute PiShock command using relay account credentials but target user's device
      const operationNames = ['shock', 'vibrate', 'beep'];
      const operationName = operationNames[operation];
      
      console.log('RELAY: Executing', operationName, 'command via Legacy API');
      console.log('RELAY: Using relay credentials with target device');
      
      const payload = {
        Username: username, // Relay account username
        Apikey: apiKey,     // Relay account API key
        Code: targetShareCode, // Target user's device share code
        Intensity: intensity,
        Duration: duration,
        Op: operation,
        Name: 'DiscordActivity-Relay',
      };
      
      console.log('RELAY: Request payload:', { 
        ...payload, 
        Apikey: '***HIDDEN***',
        Code: targetShareCode ? `${targetShareCode.slice(0, 4)}****` : 'MISSING'
      });
      
      const response = await fetch('https://do.pishock.com/api/apioperate/', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'PiShock-Discord-Activity-Relay/1.0'
        },
        body: JSON.stringify(payload),
      });

      console.log('RELAY: Response status:', response.status);
      console.log('RELAY: Response headers:', Object.fromEntries(response.headers.entries()));
      
      const responseText = await response.text();
      console.log('RELAY: Response text:', responseText);

      if (!response.ok) {
        console.error('RELAY: HTTP error:', response.status, responseText);
        throw new Error(`PiShock API error: HTTP ${response.status} - ${responseText}`);
      }

      // Check for success responses as per Legacy API documentation
      let commandSuccessful = false;
      
      if (responseText.includes('Operation Succeeded')) {
        console.log('RELAY: ✅ Command executed successfully (Operation Succeeded)');
        commandSuccessful = true;
      } else if (response.status === 200 && responseText.trim().length === 0) {
        console.log('RELAY: ✅ Command executed successfully (HTTP 200 with empty response)');
        commandSuccessful = true;
      } else if (response.status === 200) {
        console.log('RELAY: ✅ Command executed successfully (HTTP 200)');
        commandSuccessful = true;
      } else {
        // Check for specific error messages from documentation
        if (responseText.includes("This code doesn't exist")) {
          console.error('RELAY: ❌ Share code not found');
          throw new Error('Target user\'s share code not found. They may need to regenerate it.');
        } else if (responseText.includes('Not Authorized')) {
          console.error('RELAY: ❌ Not authorized - relay account credentials invalid');
          throw new Error('Relay account credentials are invalid. Please check configuration.');
        } else if (responseText.includes('Shocker is Paused')) {
          console.error('RELAY: ❌ Device is paused');
          throw new Error('Target device is paused. Ask them to unpause it in the PiShock web panel.');
        } else if (responseText.includes('Device currently not connected')) {
          console.error('RELAY: ❌ Device not connected');
          throw new Error('Target device is not connected. Ask them to ensure their device is online.');
        } else if (responseText.includes('already been used by somebody else')) {
          console.error('RELAY: ❌ Share code already in use');
          throw new Error('Target user\'s share code is already in use. They need to generate a new one.');
        } else if (responseText.includes('Unknown Op')) {
          console.error('RELAY: ❌ Invalid operation');
          throw new Error('Invalid operation specified.');
        } else if (responseText.includes('Intensity must be between')) {
          console.error('RELAY: ❌ Invalid intensity');
          throw new Error('Invalid intensity specified.');
        } else if (responseText.includes('Duration must be between')) {
          console.error('RELAY: ❌ Invalid duration');
          throw new Error('Invalid duration specified.');
        } else {
          console.log('RELAY: ⚠️ Unknown response, assuming success:', responseText);
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
        instanceId: 'relay', // Special instance ID for relay commands
        executorUserId,
        executorUsername: executorUser?.global_name || executorUser?.username || 'Unknown User',
        executorAvatar: executorUser?.avatar ? `https://cdn.discordapp.com/avatars/${executorUserId}/${executorUser.avatar}.png` : undefined,
        targetUserId,
        targetUsername: targetUser?.global_name || targetUser?.username || 'Unknown User',
        targetAvatar: targetUser?.avatar ? `https://cdn.discordapp.com/avatars/${targetUserId}/${targetUser.avatar}.png` : undefined,
        action: operationName as 'shock' | 'vibrate' | 'beep',
        intensity,
        duration,
        relayUsed: true,
      };

      // Store activity log entry
      const logKey = `activity:log:${logEntry.timestamp}:${logEntry.id}`;
      await env.PISHOCK_KV.put(logKey, JSON.stringify(logEntry));
      await addToActivityIndex(env.PISHOCK_KV, logKey);

      console.log('RELAY: ✅ Activity logged with ID:', logEntry.id);
      console.log('RELAY: Command execution completed successfully');

      return jsonResponse({ 
        success: true, 
        logEntryId: logEntry.id,
        relayUsed: true,
        message: `${operationName} command sent via relay account to ${targetUser?.global_name || targetUser?.username || 'target user'}'s device`,
        debug: {
          relayUsername: username,
          targetShareCode: targetShareCode ? `${targetShareCode.slice(0, 4)}****` : 'MISSING',
          response: responseText
        }
      });

    } catch (error) {
      console.error('RELAY: PiShock execution failed:', error);
      return jsonResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Command execution failed',
        debug: {
          relayConfigured: !!(apiKey && username),
          targetConfigured: !!targetShareCode,
          errorType: error instanceof Error ? error.constructor.name : 'Unknown'
        }
      });
    }
  } catch (error) {
    console.error('RELAY: General error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};