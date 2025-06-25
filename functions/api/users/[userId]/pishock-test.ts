interface Env {
  PISHOCK_KV: KVNamespace;
}

import { validateDiscordToken } from '../../../lib/discord-auth';
import { decrypt, testPiShockOperation, validatePiShockCredentials, checkUserDevices } from '../../../lib/pishock-api';

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

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const method = request.method;
  const userId = params.userId as string;

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
    console.error('TEST: Invalid method:', method);
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) {
    console.error('TEST: No authorization token provided');
    return new Response('Unauthorized', { status: 401 });
  }

  const user = await validateDiscordToken(token, env.PISHOCK_KV);
  if (!user) {
    console.error('TEST: Invalid Discord token');
    return new Response('Invalid token', { status: 401 });
  }

  // Users can only test their own PiShock settings
  if (user.id !== userId) {
    console.error('TEST: User trying to test someone else\'s settings:', user.id, 'vs', userId);
    return new Response('Forbidden', { status: 403 });
  }

  console.log('=== STARTING PISHOCK TEST (Legacy API) ===');
  console.log('TEST: User ID:', userId);
  console.log('TEST: Discord user:', user.username);

  try {
    // Get all user data from single key
    const userDataStr = await env.PISHOCK_KV.get(`user:${userId}:data`);
    const userData = userDataStr ? JSON.parse(userDataStr) : null;
    
    if (!userData?.credentials) {
      console.error('TEST: No credentials stored for user:', userId);
      return jsonResponse({ 
        success: false, 
        isConnected: false, 
        error: 'No credentials stored for this user' 
      });
    }

    console.log('TEST: Found user data with credentials');

    try {
      const creds = await decrypt(userData.credentials);
      console.log('TEST: Successfully decrypted credentials');
      console.log('TEST: Username:', creds.username);
      console.log('TEST: Has API key:', !!creds.apiKey);
      console.log('TEST: API key length:', creds.apiKey?.length || 0);
      console.log('TEST: Share code:', creds.sharecode);
      console.log('TEST: Has own device:', creds.hasOwnDevice);
      console.log('TEST: Max limits:', { maxIntensity: creds.maxIntensity || 100, maxDuration: creds.maxDuration || 15 });
      
      // Test actual device operation
      console.log('TEST: Starting device operation test...');
      const operationTest = await testPiShockOperation(creds.apiKey, creds.username, creds.sharecode);
      
      console.log('TEST: Operation test result:', operationTest);
      
      let hasDevice = false;
      let deviceCount = 0;
      let deviceDebugInfo = null;
      let piShockUserId = null;
      
      if (operationTest.success) {
        // If device operation succeeds, get credential info and check devices
        console.log('TEST: Device operation successful, getting credential info...');
      const credentialValidation = await validatePiShockCredentials(creds.apiKey, creds.username);
      
        console.log('TEST: Credential validation result:', credentialValidation);
      
        if (credentialValidation.valid && credentialValidation.userId) {
          piShockUserId = credentialValidation.userId;
          console.log('TEST: Got PiShock user ID, checking for devices...');
          // Check for devices using V3 API
          const deviceCheck = await checkUserDevices(piShockUserId, creds.apiKey);
          hasDevice = deviceCheck.hasDevices;
          deviceCount = deviceCheck.devices?.length || 0;
          deviceDebugInfo = deviceCheck.debugInfo;
          
          console.log('TEST: Device check result:', {
            hasDevices: hasDevice,
            deviceCount,
            error: deviceCheck.error
          });
        }
        
        // Update stored PiShock user ID in user data if we got one
        if (piShockUserId) {
          userData.piShockUserId = piShockUserId;
        }
        userData.lastTested = new Date().toISOString();
        await env.PISHOCK_KV.put(`user:${userId}:data`, JSON.stringify(userData));
      } else {
        console.error('TEST: Device operation test failed:', operationTest.error);
      }
      
      const result = {
        success: operationTest.success, 
        isConnected: operationTest.success, 
        hasDevice,
        deviceCount,
        piShockUserId,
        lastTested: userData.lastTested,
        debug: {
          operationTest: operationTest.debugInfo,
          deviceCheck: deviceDebugInfo,
          storedCredentials: {
            username: creds.username,
            hasApiKey: !!creds.apiKey,
            apiKeyLength: creds.apiKey?.length || 0,
            sharecode: creds.sharecode,
            hasOwnDevice: creds.hasOwnDevice
          }
        }
      };
      
      console.log('TEST: Final result:', result);
      
      if (!operationTest.success) {
        result.error = operationTest.error || 'Device operation test failed';
      }
      
      return jsonResponse(result);
    } catch (decryptError) {
      console.error('TEST: Decryption failed:', decryptError);
      return jsonResponse({ 
        success: false, 
        isConnected: false, 
        error: 'Failed to decrypt stored credentials',
        debug: {
          decryptionError: decryptError instanceof Error ? decryptError.message : 'Unknown error'
        }
      });
    }
  } catch (error) {
    console.error('TEST: General error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      debug: {
        generalError: error instanceof Error ? error.message : 'Unknown error'
      }
    }, 500);
  }
};