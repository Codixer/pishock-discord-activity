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

async function validateSharedCredentials(apiKey: string, username: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
  try {
    console.log('SHARED_TEST: Testing shared bot credentials');
    console.log('SHARED_TEST: Username:', username);
    console.log('SHARED_TEST: API Key length:', apiKey.length);

    const url = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    console.log('SHARED_TEST: Making request to:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity-Bot/1.0',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    console.log('SHARED_TEST: Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('SHARED_TEST: Error response:', errorText);
      return { 
        valid: false, 
        error: `Authentication failed: HTTP ${response.status} - ${errorText}`
      };
    }

    const responseText = await response.text();
    console.log('SHARED_TEST: Raw response text:', responseText);

    // Parse the response
    let authData;
    try {
      authData = JSON.parse(responseText);
      console.log('SHARED_TEST: Parsed JSON response:', authData);
    } catch (parseError) {
      console.log('SHARED_TEST: Failed to parse as JSON, trying as plain text');
      
      // Sometimes the API returns just a plain number (user ID)
      if (/^\d+$/.test(responseText.trim())) {
        const userId = responseText.trim();
        console.log('SHARED_TEST: Found plain text user ID:', userId);
        return { valid: true, userId };
      }
      
      return { 
        valid: false, 
        error: 'Invalid response format - not JSON or plain number'
      };
    }

    // Look for UserID field variations
    let userId = null;
    
    if (authData.UserId !== undefined && authData.UserId !== null) {
      userId = authData.UserId.toString();
      console.log('SHARED_TEST: Found UserId in response:', userId);
    } else if (authData.UserID !== undefined && authData.UserID !== null) {
      userId = authData.UserID.toString();
      console.log('SHARED_TEST: Found UserID in response:', userId);
    } else if (authData.userId !== undefined && authData.userId !== null) {
      userId = authData.userId.toString();
      console.log('SHARED_TEST: Found userId in response:', userId);
    } else if (authData.id !== undefined && authData.id !== null) {
      userId = authData.id.toString();
      console.log('SHARED_TEST: Found id in response:', userId);
    } else if (typeof authData === 'number') {
      userId = authData.toString();
      console.log('SHARED_TEST: Response is a number:', userId);
    }

    if (userId && /^\d+$/.test(userId)) {
      console.log('SHARED_TEST: ✓ Successfully validated shared credentials');
      return { valid: true, userId };
    }

    console.log('SHARED_TEST: No valid UserID found in response');
    return { 
      valid: false, 
      error: 'No UserID found in API response'
    };

  } catch (error) {
    console.error('SHARED_TEST: Credential validation error:', error);
    return { 
      valid: false, 
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
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

  if (method !== 'POST') {
    console.error('SHARED_TEST: Invalid method:', method);
    return new Response('Method not allowed', { status: 405 });
  }

  const token = await requireAuth(request);
  if (!token) {
    console.error('SHARED_TEST: No authorization token provided');
    return new Response('Unauthorized', { status: 401 });
  }

  const user = await validateDiscordToken(token);
  if (!user) {
    console.error('SHARED_TEST: Invalid Discord token');
    return new Response('Invalid token', { status: 401 });
  }

  // Users can only test their own shared credentials access
  if (user.id !== userId) {
    console.error('SHARED_TEST: User trying to test someone else\'s access:', user.id, 'vs', userId);
    return new Response('Forbidden', { status: 403 });
  }

  console.log('=== STARTING SHARED CREDENTIALS TEST ===');
  console.log('SHARED_TEST: User ID:', userId);
  console.log('SHARED_TEST: Discord user:', user.username);

  try {
    // Check if user has consented to use shared credentials
    const consentData = await env.PISHOCK_KV.get(`user:${userId}:shared_consent`);
    if (!consentData) {
      console.error('SHARED_TEST: User has not consented to shared credentials');
      return jsonResponse({ 
        success: false, 
        error: 'You have not consented to use shared credentials' 
      });
    }

    // Check if shared credentials are available in environment
    const sharedApiKey = env.PISHOCK_RELAY_API_KEY;
    const sharedUsername = env.PISHOCK_RELAY_USERNAME;

    console.log('SHARED_TEST: Shared credentials status:');
    console.log('SHARED_TEST: Has shared API key:', !!sharedApiKey);
    console.log('SHARED_TEST: Has shared username:', !!sharedUsername);

    if (!sharedApiKey || !sharedUsername) {
      console.error('SHARED_TEST: Shared credentials not configured in environment');
      return jsonResponse({ 
        success: false, 
        error: 'Shared credentials not configured in environment' 
      });
    }

    console.log('SHARED_TEST: Testing shared credentials...');
    const credentialValidation = await validateSharedCredentials(sharedApiKey, sharedUsername);
    
    console.log('SHARED_TEST: Validation result:', credentialValidation);
    
    const result = {
      success: credentialValidation.valid, 
      isConnected: credentialValidation.valid,
      sharedUserId: credentialValidation.userId,
      message: credentialValidation.valid 
        ? 'Shared credentials are working correctly'
        : `Shared credentials test failed: ${credentialValidation.error}`,
      description: 'Shared bot credentials validated successfully'
    };
    
    console.log('SHARED_TEST: Final result:', result);
    
    if (!credentialValidation.valid) {
      result.error = credentialValidation.error || 'Shared credentials test failed';
    }
    
    return jsonResponse(result);
  } catch (error) {
    console.error('SHARED_TEST: General error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};