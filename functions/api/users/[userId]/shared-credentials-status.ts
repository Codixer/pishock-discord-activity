interface Env {
  PISHOCK_KV: KVNamespace;
  PISHOCK_RELAY_API_KEY?: string;
  PISHOCK_RELAY_USERNAME?: string;
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

async function validateSharedCredentials(apiKey: string, username: string): Promise<{ valid: boolean; userId?: string }> {
  try {
    console.log('SHARED_STATUS: Validating shared bot credentials');
    console.log('SHARED_STATUS: Username:', username);
    
    const url = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity-Bot/1.0',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    
    console.log('SHARED_STATUS: Response status:', response.status);
    
    if (!response.ok) {
      console.log('SHARED_STATUS: Authentication failed:', response.status);
      return { valid: false };
    }
    
    const responseText = await response.text();
    console.log('SHARED_STATUS: Raw response:', responseText.substring(0, 200));
    
    // Try to parse as JSON first
    let authData;
    try {
      authData = JSON.parse(responseText);
      console.log('SHARED_STATUS: Parsed as JSON:', authData);
    } catch (parseError) {
      // Check if it's a plain number (user ID)
      if (/^\d+$/.test(responseText.trim())) {
        const userId = responseText.trim();
        console.log('SHARED_STATUS: Found plain text user ID:', userId);
        return { valid: true, userId };
      }
      console.log('SHARED_STATUS: Failed to parse response');
      return { valid: false };
    }
    
    // Look for UserID field variations
    let userId = null;
    
    if (authData.UserId !== undefined && authData.UserId !== null) {
      userId = authData.UserId.toString();
    } else if (authData.UserID !== undefined && authData.UserID !== null) {
      userId = authData.UserID.toString();
    } else if (authData.userId !== undefined && authData.userId !== null) {
      userId = authData.userId.toString();
    } else if (authData.id !== undefined && authData.id !== null) {
      userId = authData.id.toString();
    } else if (typeof authData === 'number') {
      userId = authData.toString();
    }
    
    if (userId && /^\d+$/.test(userId)) {
      console.log('SHARED_STATUS: Found valid user ID:', userId);
      return { valid: true, userId };
    }
    
    console.log('SHARED_STATUS: No valid user ID found');
    return { valid: false };
  } catch (error) {
    console.error('SHARED_STATUS: Credential validation error:', error);
    return { valid: false };
  }
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

  if (method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token);
  if (!user) return new Response('Invalid token', { status: 401 });

  // Users can only check their own shared credentials status
  if (user.id !== userId) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    // Check if shared credentials are available in environment
    const sharedApiKey = env.PISHOCK_RELAY_API_KEY;
    const sharedUsername = env.PISHOCK_RELAY_USERNAME;
    const available = !!(sharedApiKey && sharedUsername);

    if (!available) {
      return jsonResponse({ 
        available: false,
        isConnected: false,
        hasConsented: false,
        message: 'Shared credentials not configured in environment'
      });
    }

    // Check if user has consented to use shared credentials
    const consentData = await env.PISHOCK_KV.get(`user:${userId}:shared_consent`);
    const hasConsented = !!consentData;

    let isConnected = false;
    let sharedUserId = null;
    if (hasConsented) {
      // Test the shared credentials
      const credentialValidation = await validateSharedCredentials(sharedApiKey, sharedUsername);
      isConnected = credentialValidation.valid;
      sharedUserId = credentialValidation.userId;
      
      console.log('SHARED_STATUS: Shared credentials test result:', isConnected);
    }

    const result = { 
      available,
      isConnected: available && hasConsented && isConnected,
      hasConsented,
      sharedUserId,
      message: available ? 'Shared credentials available' : 'Shared credentials not configured'
    };
    
    console.log('SHARED_STATUS: Final result for user', userId, ':', result);
    return jsonResponse(result);
  } catch (error) {
    console.error('Shared credentials status error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};