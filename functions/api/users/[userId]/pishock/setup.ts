import { PiShockAPI } from '../../../../src/services/pishock';

interface Env {
  PISHOCK_KV: KVNamespace;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

async function requireAuth(request: Request, env: Env): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  
  const token = auth.slice(7);
  
  // Validate token by checking if it exists in KV
  const userKeys = await env.PISHOCK_KV.list({ prefix: 'discord_token:' });
  const validToken = userKeys.keys.find(key => key.name.includes(token));
  
  return validToken ? token : null;
}

function encrypt(data: any): string {
  // Simple base64 encoding - in production, use proper encryption
  return btoa(JSON.stringify(data));
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
    const { apiKey, username, maxIntensity = 100, maxDuration = 15 } = await request.json();

    if (!apiKey || !username) {
      return jsonResponse({ 
        error: 'API key and username are required' 
      }, 400);
    }

    // Validate credentials and get complete setup
    const setupData = await PiShockAPI.getCompleteUserSetup({
      apiKey,
      username
    });

    // Store encrypted user settings
    const userSettings = {
      credentials: encrypt({ apiKey, username }),
      devices: setupData.devices,
      sharedShockers: setupData.sharedShockers,
      maxIntensity: Math.min(Math.max(maxIntensity, 1), 100),
      maxDuration: Math.min(Math.max(maxDuration, 1), 30),
      lastUpdated: new Date().toISOString(),
    };

    await env.PISHOCK_KV.put(
      `user_settings:${userId}`,
      JSON.stringify(userSettings)
    );

    return jsonResponse({
      success: true,
      devices: setupData.devices,
      sharedShockers: setupData.sharedShockers,
      maxIntensity: userSettings.maxIntensity,
      maxDuration: userSettings.maxDuration,
    });
  } catch (error) {
    console.error('PiShock setup error:', error);
    return jsonResponse({
      error: 'Setup failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const userId = params.userId as string;

  const token = await requireAuth(request, env);
  if (!token) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const settingsData = await env.PISHOCK_KV.get(`user_settings:${userId}`);
    
    if (!settingsData) {
      return jsonResponse({ 
        configured: false,
        message: 'No PiShock configuration found'
      });
    }

    const settings = JSON.parse(settingsData);
    
    // Return settings without exposing credentials
    return jsonResponse({
      configured: true,
      devices: settings.devices || [],
      sharedShockers: settings.sharedShockers || {},
      maxIntensity: settings.maxIntensity || 100,
      maxDuration: settings.maxDuration || 15,
      lastUpdated: settings.lastUpdated,
    });
  } catch (error) {
    console.error('Get PiShock setup error:', error);
    return jsonResponse({
      error: 'Failed to get setup',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const userId = params.userId as string;

  const token = await requireAuth(request, env);
  if (!token) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    await env.PISHOCK_KV.delete(`user_settings:${userId}`);
    
    return jsonResponse({
      success: true,
      message: 'PiShock configuration removed'
    });
  } catch (error) {
    console.error('Delete PiShock setup error:', error);
    return jsonResponse({
      error: 'Failed to delete setup',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
};