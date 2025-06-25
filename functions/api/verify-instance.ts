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
      try {
        const cleanupPromises = [
          env.PISHOCK_KV.delete(`instance:${instanceId}:status`),
          env.PISHOCK_KV.delete(`instance_data:${instanceId}`),
          env.PISHOCK_KV.delete(`instance:${instanceId}:pishock`),
          env.PISHOCK_KV.delete(`instance:${instanceId}:pishock:lastTested`),
          env.PISHOCK_KV.delete(`instance:${instanceId}:pishock:configuredBy`)
        ];
        
        await Promise.allSettled(cleanupPromises);
      } catch (cleanupError) {
        // Silently handle cleanup errors
      }
      
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

    const instanceData = await discordResponse.json();

    try {
      const now = new Date().toISOString();
      const statusData = {
        status: 'active',
        created_at: now,
        last_activity: now,
        last_verified: now,
        participant_count: instanceData.users?.length || 0,
        discord_verified: true,
        location: instanceData.location
      };

      await env.PISHOCK_KV.put(
        `instance:${instanceId}:status`, 
        JSON.stringify(statusData), 
        { expirationTtl: 21600 }
      );
    } catch (kvError) {
      // Don't fail the verification if KV update fails
    }

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
    const instanceId = url.searchParams.get('instance_id');
    if (instanceId) {
      try {
        const kvStatus = await env.PISHOCK_KV.get(`instance:${instanceId}:status`);
        
        if (kvStatus) {
          const status = JSON.parse(kvStatus);
          const lastVerified = new Date(status.last_verified || status.created_at);
          const oneHourAgo = new Date(Date.now() - 3600000);
          
          if (lastVerified > oneHourAgo && status.status === 'active') {
            return jsonResponse({ 
              valid: true, 
              instanceData: {
                instanceId,
                fallback: true,
                lastVerified: status.last_verified,
                participantCount: status.participant_count || 0
              }
            });
          }
        }
      } catch (kvError) {
        // Silently handle KV fallback errors
      }
    }

    return jsonResponse({ 
      valid: false, 
      error: 'Instance verification failed due to network error. Please try again.',
      temporary: true
    }, 503);
  }
};