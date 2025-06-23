interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_BOT_TOKEN: string;
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

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const method = request.method;
  const url = new URL(request.url);

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

  try {
    const applicationId = url.searchParams.get('application_id');
    const instanceId = url.searchParams.get('instance_id');

    if (!applicationId || !instanceId) {
      return jsonResponse({ 
        valid: false, 
        error: 'Missing application_id or instance_id parameters' 
      }, 400);
    }

    // First check if instance exists in our KV store and hasn't expired
    try {
      const instanceStatus = await env.PISHOCK_KV.get(`instance:${instanceId}:status`);
      if (!instanceStatus) {
        console.log(`Instance ${instanceId} not found in KV or has expired`);
        return jsonResponse({ 
          valid: false, 
          error: 'Discord Activity session has expired (maximum 6 hours). Please start a new session from Discord.' 
        }, 404);
      }

      const status = JSON.parse(instanceStatus);
      if (status.status === 'inactive') {
        console.log(`Instance ${instanceId} is marked as inactive in KV`);
        return jsonResponse({ 
          valid: false, 
          error: 'Discord Activity session is inactive. Please start a new session from Discord.' 
        }, 404);
      }
    } catch (kvError) {
      console.warn('Failed to check instance status in KV:', kvError);
      // Continue with Discord verification if KV check fails
    }

    if (!env.DISCORD_BOT_TOKEN) {
      console.error('DISCORD_BOT_TOKEN not configured in environment');
      return jsonResponse({ 
        valid: false, 
        error: 'Server configuration error' 
      }, 500);
    }

    console.log(`Verifying Discord instance: ${instanceId} for application: ${applicationId}`);

    // Verify the instance with Discord's API
    const discordResponse = await fetch(
      `https://discord.com/api/applications/${applicationId}/activity-instances/${instanceId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
          'User-Agent': 'PiShock-Discord-Activity/1.0',
        },
      }
    );

    if (discordResponse.status === 404) {
      console.log(`Instance ${instanceId} not found or inactive`);
      
      // Clean up expired instance data from KV if Discord says it doesn't exist
      try {
        await env.PISHOCK_KV.delete(`instance:${instanceId}:status`);
        console.log(`Cleaned up expired instance ${instanceId} from KV`);
      } catch (cleanupError) {
        console.warn('Failed to clean up expired instance:', cleanupError);
      }
      
      return jsonResponse({ 
        valid: false, 
        error: 'Discord Activity session not found or has expired. Please start a new session from Discord.' 
      }, 404);
    }

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      console.error(`Discord API error: ${discordResponse.status} - ${errorText}`);
      return jsonResponse({ 
        valid: false, 
        error: `Discord API error: ${discordResponse.status}` 
      }, discordResponse.status);
    }

    const instanceData = await discordResponse.json();
    console.log(`✓ Instance ${instanceId} verified successfully`);

    return jsonResponse({ 
      valid: true, 
      instanceData 
    });

  } catch (error) {
    console.error('Instance verification error:', error);
    return jsonResponse({ 
      valid: false, 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};