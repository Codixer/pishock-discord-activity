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
    console.log('=== Shared Bot Credentials Validation ===');
    console.log('Username:', username);

    const url = `https://auth.pishock.com/Auth/GetUserIfAPIKeyValid?apikey=${encodeURIComponent(apiKey)}&username=${encodeURIComponent(username)}`;
    console.log('Making request to:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'PiShock-Discord-Activity-Bot/1.0',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response:', errorText);
      return { 
        valid: false, 
        error: `Shared credentials authentication failed: HTTP ${response.status}`
      };
    }

    const responseText = await response.text();
    console.log('Raw response text:', responseText);

    // Parse the response
    let authData;
    try {
      authData = JSON.parse(responseText);
      console.log('Parsed JSON response:', authData);
    } catch (parseError) {
      console.log('Failed to parse as JSON, trying as plain text');
      
      // Sometimes the API returns just a plain number (user ID)
      if (/^\d+$/.test(responseText.trim())) {
        const userId = responseText.trim();
        console.log('Found plain text user ID:', userId);
        return { valid: true, userId };
      }
      
      return { 
        valid: false, 
        error: 'Invalid response format from PiShock API'
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
      console.log('✓ Successfully validated shared credentials');
      return { valid: true, userId };
    }

    console.log('No valid UserID found in response');
    return { 
      valid: false, 
      error: 'No UserID found in API response'
    };

  } catch (error) {
    console.error('Shared credentials validation error:', error);
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

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordToken(token);
  if (!user) return new Response('Invalid token', { status: 401 });

  // Users can only manage their own shared credentials consent
  if (user.id !== userId) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    if (method === 'PUT') {
      const { consent } = await request.json();

      if (consent !== true) {
        return jsonResponse({ 
          success: false, 
          error: 'Explicit consent is required to use shared credentials' 
        }, 400);
      }

      // Check if shared credentials are available in environment
      const sharedApiKey = env.PISHOCK_RELAY_API_KEY;
      const sharedUsername = env.PISHOCK_RELAY_USERNAME;

      if (!sharedApiKey || !sharedUsername) {
        return jsonResponse({ 
          success: false, 
          error: 'Shared credentials not configured in environment' 
        }, 500);
      }

      console.log('=== Enabling Shared Credentials for User ===');
      console.log('User ID:', userId);

      // Validate the shared credentials
      const credentialValidation = await validateSharedCredentials(sharedApiKey, sharedUsername);
      
      if (!credentialValidation.valid) {
        console.log('Shared credentials validation failed:', credentialValidation.error);
        return jsonResponse({ 
          success: false, 
          error: credentialValidation.error || 'Shared credentials are not working properly'
        });
      }

      console.log('✓ Shared credentials validation successful');
      
      // Store user's consent with timestamp
      const consentData = {
        consented: true,
        timestamp: new Date().toISOString(),
        userId: user.id,
        username: user.username
      };
      
      await env.PISHOCK_KV.put(`user:${userId}:shared_consent`, JSON.stringify(consentData));

      console.log('✓ Shared credentials consent saved for user:', userId);
      
      // Clear the user's status cache so it gets refreshed immediately
      try {
        const statusCacheKey = `cache:user_status:${userId}`;
        await env.PISHOCK_KV.delete(statusCacheKey);
        console.log('✓ Cleared status cache for user:', userId);
      } catch (error) {
        console.warn('Failed to clear status cache:', error);
      }

      return jsonResponse({ 
        success: true, 
        message: 'Shared credentials enabled successfully'
      });
    }

    if (method === 'DELETE') {
      // Remove user's consent
      await env.PISHOCK_KV.delete(`user:${userId}:shared_consent`);
      
      // Clear cache
      try {
        const statusCacheKey = `cache:user_status:${userId}`;
        await env.PISHOCK_KV.delete(statusCacheKey);
      } catch (error) {
        console.warn('Failed to clear status cache:', error);
      }
      
      return jsonResponse({ success: true });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('Shared credentials error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};