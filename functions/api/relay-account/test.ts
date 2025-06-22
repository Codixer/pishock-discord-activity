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

async function validatePiShockCredentials(apiKey: string, username: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
  try {
    console.log('RELAY_TEST: Validating relay account credentials using Legacy API');
    console.log('RELAY_TEST: Username:', username);
    
    // First, validate the relay account credentials
    const url = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    console.log('RELAY_TEST: Validating credentials at:', url);
    
    const authResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity/1.0',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    
    console.log('RELAY_TEST: Response status:', authResponse.status);
    
    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      console.log('RELAY_TEST: Error response:', errorText);
      return { 
        valid: false, 
        error: `Authentication failed: HTTP ${authResponse.status}` 
      };
    }
    
    const responseText = await authResponse.text();
    console.log('RELAY_TEST: Raw response:', responseText);
    
    // Parse the response
    let authData;
    try {
      authData = JSON.parse(responseText);
      console.log('RELAY_TEST: Parsed JSON response:', authData);
    } catch (parseError) {
      // Sometimes the API returns just a plain number (user ID)
      if (/^\d+$/.test(responseText.trim())) {
        const userId = responseText.trim();
        console.log('RELAY_TEST: Found plain text user ID:', userId);
        return { valid: true, userId };
      }
      
      return { 
        valid: false, 
        error: 'Invalid response format' 
      };
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
      console.log('RELAY_TEST: ✓ Successfully validated relay account credentials');
      return { valid: true, userId };
    }
    
    console.log('RELAY_TEST: No valid UserID found in response');
    return { 
      valid: false, 
      error: 'No UserID found in API response' 
    };
  } catch (error) {
    console.error('RELAY_TEST: PiShock credential validation error:', error);
    return { 
      valid: false, 
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
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
    const apiKey = env.PISHOCK_RELAY_API_KEY;
    const username = env.PISHOCK_RELAY_USERNAME;

    if (!apiKey || !username) {
      return jsonResponse({ 
        success: false, 
        isConnected: false, 
        error: 'Relay account not configured - missing API key or username' 
      });
    }

    // Use proper PiShock API to validate relay account credentials
    const credentialValidation = await validatePiShockCredentials(apiKey, username);
    const lastTested = new Date().toISOString();
    
    // Store last test time in KV
    await env.PISHOCK_KV.put('relay_account:last_tested', lastTested);
    
    if (credentialValidation.valid) {
      await env.PISHOCK_KV.put('relay_account:user_id', credentialValidation.userId || '');
      console.log('RELAY_TEST: ✅ Relay account validation successful');
      console.log('RELAY_TEST: Relay account can now send commands to user devices');
    } else {
      console.log('RELAY_TEST: ❌ Relay account validation failed:', credentialValidation.error);
    }
    
    return jsonResponse({ 
      success: credentialValidation.valid, 
      isConnected: credentialValidation.valid, 
      userId: credentialValidation.userId,
      lastTested,
      message: credentialValidation.valid 
        ? 'Relay account credentials are valid and can send commands to user devices'
        : `Relay account validation failed: ${credentialValidation.error}`
      description: 'Relay account credentials validated - can send commands to user devices'
    });
  } catch (error) {
    console.error('Relay account test error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};