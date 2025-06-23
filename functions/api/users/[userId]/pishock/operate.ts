import { PiShockAPI } from '../../../../shared/pishock';
import { v4 as uuidv4 } from 'uuid';

interface Env {
  PISHOCK_KV: KVNamespace;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

async function requireAuth(request: Request, env: Env): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  
  const token = auth.slice(7);
  const userKeys = await env.PISHOCK_KV.list({ prefix: 'discord_token:' });
  const validToken = userKeys.keys.find(key => key.name.includes(token));
  
  return validToken ? token : null;
}

function decrypt(data: string): any {
  try {
    return JSON.parse(atob(data));
  } catch {
    throw new Error('Failed to decrypt data');
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const userId = params.userId as string;

  const token = await requireAuth(request, env);
  if (!token) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const { 
      shareCode, 
      operation, 
      intensity, 
      duration, 
      executorId,
      executorName 
    } = await request.json();

    // Validate parameters
    if (!shareCode || ![0, 1, 2].includes(operation) || !intensity || !duration) {
      return jsonResponse({ 
        error: 'Invalid parameters. shareCode, operation (0-2), intensity, and duration are required.' 
      }, 400);
    }

    if (intensity < 1 || intensity > 100) {
      return jsonResponse({ 
        error: 'Intensity must be between 1 and 100' 
      }, 400);
    }

    if (duration < 1 || duration > 30) {
      return jsonResponse({ 
        error: 'Duration must be between 1 and 30 seconds' 
      }, 400);
    }

    // Get user settings to access credentials
    const settingsData = await env.PISHOCK_KV.get(`user_settings:${userId}`);
    if (!settingsData) {
      return jsonResponse({ 
        error: 'User has not configured PiShock settings' 
      }, 400);
    }

    const settings = JSON.parse(settingsData);
    const credentials = decrypt(settings.credentials);

    // Check user limits
    if (intensity > settings.maxIntensity) {
      return jsonResponse({ 
        error: `Intensity ${intensity}% exceeds user's limit of ${settings.maxIntensity}%` 
      }, 400);
    }

    if (duration > settings.maxDuration) {
      return jsonResponse({ 
        error: `Duration ${duration}s exceeds user's limit of ${settings.maxDuration}s` 
      }, 400);
    }

    // Execute PiShock operation
    const operateRequest = {
      code: shareCode,
      duration,
      intensity,
      op: operation,
      apikey: credentials.apiKey,
      username: credentials.username,
      name: 'Discord-Activity',
      random: false,
      scale: false,
    };

    const result = await PiShockAPI.operate(operateRequest);

    // Log the activity
    const logEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      executorId: executorId || 'unknown',
      executorName: executorName || 'Unknown User',
      targetUserId: userId,
      shareCode,
      action: ['shock', 'vibrate', 'beep'][operation],
      intensity,
      duration,
      result,
    };

    // Store activity log
    const logKey = `activity_log:${Date.now()}:${logEntry.id}`;
    await env.PISHOCK_KV.put(logKey, JSON.stringify(logEntry), {
      expirationTtl: 2592000 // 30 days
    });

    return jsonResponse({
      success: true,
      logId: logEntry.id,
      result,
      message: `${logEntry.action} command executed successfully`,
    });
  } catch (error) {
    console.error('PiShock operate error:', error);
    return jsonResponse({
      error: 'Operation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
};