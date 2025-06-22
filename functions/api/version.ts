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
      // Prevent caching of version responses
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
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

  try {
    if (method === 'GET') {
      console.log('VERSION: Getting latest version from KV storage');
      
      // Get the latest version from KV storage
      let latestVersion = await env.PISHOCK_KV.get('app:latest_version');
      let deployedAt = await env.PISHOCK_KV.get('app:deployed_at');
      
      console.log('VERSION: Raw values from KV:', { latestVersion, deployedAt });
      
      // Generate a proper version based on current timestamp if none exists or if it's "unknown"
      if (!latestVersion || latestVersion === 'unknown' || latestVersion === 'null' || latestVersion === 'undefined') {
        const newVersion = `v${Date.now()}`;
        const newDeployedAt = new Date().toISOString();
        
        console.log('VERSION: No valid version found, creating new one:', newVersion);
        
        // Store the new version
        await Promise.all([
          env.PISHOCK_KV.put('app:latest_version', newVersion),
          env.PISHOCK_KV.put('app:deployed_at', newDeployedAt)
        ]);
        
        latestVersion = newVersion;
        deployedAt = newDeployedAt;
      }
      
      // Ensure deployedAt has a value
      if (!deployedAt) {
        deployedAt = new Date().toISOString();
        await env.PISHOCK_KV.put('app:deployed_at', deployedAt);
      }
      
      const result = {
        latestVersion,
        deployedAt
      };
      
      console.log('VERSION: Returning result:', result);
      
      return jsonResponse(result);
    }

    if (method === 'POST') {
      // Update the latest version (called during deployment)
      const body = await request.json();
      const { version } = body;
      
      console.log('VERSION: POST request to update version:', version);
      
      if (!version || version === 'unknown') {
        return jsonResponse({ error: 'Valid version is required' }, 400);
      }

      const deployedAt = new Date().toISOString();
      
      await Promise.all([
        env.PISHOCK_KV.put('app:latest_version', version),
        env.PISHOCK_KV.put('app:deployed_at', deployedAt)
      ]);

      console.log('VERSION: Successfully updated to:', version);

      return jsonResponse({ 
        success: true, 
        version,
        deployedAt
      });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('VERSION: API error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};