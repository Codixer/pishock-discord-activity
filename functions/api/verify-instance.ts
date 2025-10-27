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
    // Create url from request object
    const url = new URL(request.url);
    const applicationId = url.searchParams.get('application_id');
    const instanceId = url.searchParams.get('instance_id');

    if (!applicationId || !instanceId) {
      return jsonResponse({ 
        valid: false, 
        error: 'Missing application_id or instance_id parameters' 
      }, 400);
    }

    if (!env.DISCORD_BOT_TOKEN) {
      return jsonResponse({ 
        valid: false, 
        error: 'Server configuration error' 
      }, 500);
    }

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
      return jsonResponse({ 
        valid: false, 
        error: 'Discord Activity session not found or has expired. Please start a new session from Discord.' 
      }, 404);
    }

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      return jsonResponse({ 
        valid: false, 
        error: `Discord API error: ${discordResponse.status}` 
      }, discordResponse.status);
    }
    
    console.log('Discord response status:', discordResponse.status);

    const instanceData = await discordResponse.json();

    return jsonResponse({ 
      valid: true, 
      instanceData: {
        instanceId: instanceData.instance_id,
        applicationId: instanceData.application_id,
        participantCount: instanceData.users?.length || 0,
        location: instanceData.location,
        verifiedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    return jsonResponse({ 
      valid: false, 
      error: 'Instance verification failed due to network error. Please try again.',
      temporary: true
    }, 503);
  }
};