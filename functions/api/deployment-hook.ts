interface Env {
  PISHOCK_KV: KVNamespace;
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

  if (method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // This endpoint is called by the deployment system to update the latest version
    let deploymentData = {};
    
    try {
      deploymentData = await request.json();
    } catch (e) {
      // If no JSON body, that's fine - we'll just use the timestamp
      console.log('DEPLOYMENT: No JSON body provided, using timestamp');
    }
    
    console.log('DEPLOYMENT: Hook triggered with data:', deploymentData);
    
    // Generate a new version based on current timestamp
    const newVersion = `deploy-${Date.now()}`;
    const deployedAt = new Date().toISOString();
    
    console.log('DEPLOYMENT: Setting new version:', newVersion);
    
    // Store the new version in KV
    await Promise.all([
      env.PISHOCK_KV.put('app:latest_version', newVersion),
      env.PISHOCK_KV.put('app:deployed_at', deployedAt),
      env.PISHOCK_KV.put('app:deployment_log', JSON.stringify({
        version: newVersion,
        deployedAt,
        deploymentData,
        source: 'deployment_hook'
      }))
    ]);

    console.log('DEPLOYMENT: Successfully updated app version to:', newVersion);

    // Also set a cache-busting timestamp
    await env.PISHOCK_KV.put('app:cache_buster', Date.now().toString());

    return jsonResponse({ 
      success: true, 
      newVersion,
      deployedAt,
      message: 'Version updated successfully'
    });
  } catch (error) {
    console.error('DEPLOYMENT: Hook error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};