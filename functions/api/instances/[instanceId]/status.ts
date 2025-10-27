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
  const { request } = context;
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

  // Instance status tracking disabled to save KV writes
  // Always return success
  if (method === 'GET') {
    return jsonResponse({
      status: 'active',
      participant_count: 0,
      last_activity: new Date().toISOString()
    });
  }

  if (method === 'PUT') {
    return jsonResponse({ 
      success: true, 
      status: {
        status: 'active',
        participant_count: 0,
        last_activity: new Date().toISOString()
      }
    });
  }

  return new Response('Method not allowed', { status: 405 });
};