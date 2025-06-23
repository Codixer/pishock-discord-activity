interface Env {
  PISHOCK_KV: KVNamespace;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

async function requireAuth(request: Request, env: Env): Promise<boolean> {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  
  const token = auth.slice(7);
  const userKeys = await env.PISHOCK_KV.list({ prefix: 'discord_token:' });
  const validToken = userKeys.keys.find(key => key.name.includes(token));
  
  return !!validToken;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  
  const isAuthed = await requireAuth(request, env);
  if (!isAuthed) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Get activity logs
    const logKeys = await env.PISHOCK_KV.list({ 
      prefix: 'activity_log:',
      limit: limit + offset
    });

    // Sort by timestamp (newest first) and paginate
    const sortedKeys = logKeys.keys
      .sort((a, b) => {
        const timestampA = parseInt(a.name.split(':')[1]);
        const timestampB = parseInt(b.name.split(':')[1]);
        return timestampB - timestampA;
      })
      .slice(offset, offset + limit);

    // Fetch log entries
    const logEntries = await Promise.all(
      sortedKeys.map(async (key) => {
        const data = await env.PISHOCK_KV.get(key.name);
        return data ? JSON.parse(data) : null;
      })
    );

    const validEntries = logEntries.filter(entry => entry !== null);

    return jsonResponse({
      entries: validEntries,
      total: logKeys.keys.length,
      hasMore: offset + limit < logKeys.keys.length,
    });
  } catch (error) {
    console.error('Activity log error:', error);
    return jsonResponse({
      error: 'Failed to fetch activity log',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
};