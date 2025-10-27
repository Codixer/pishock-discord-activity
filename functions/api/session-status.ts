interface Env {
  PISHOCK_KV: KVNamespace;
}

interface SessionStatus {
  active: boolean;
  createdAt: string;
  expiresAt: string;
  lastActivity: string;
  extensionsRemaining: number;
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-cache',
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
    
    const userData = await response.json();
    return userData;
  } catch (error) {
    return null;
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const { searchParams } = url;
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

  const instanceId = searchParams.get('instanceId');
  if (!instanceId) {
    return jsonResponse({ error: 'instanceId parameter required' }, 400);
  }

  const sessionKey = `session:${instanceId}:status`;

  try {
    if (method === 'GET') {
      // Get session status
      const token = await requireAuth(request);
      if (!token) return new Response('Unauthorized', { status: 401 });
      
      const user = await validateDiscordToken(token);
      if (!user) return new Response('Invalid token', { status: 401 });

      const sessionData = await env.PISHOCK_KV.get(sessionKey);
      
      if (!sessionData) {
        return jsonResponse({ 
          active: false,
          message: 'Session not found or expired'
        });
      }

      const session: SessionStatus = JSON.parse(sessionData);
      
      // Check if session is still valid
      const now = new Date().getTime();
      const expiresAt = new Date(session.expiresAt).getTime();
      
      if (now >= expiresAt) {
        return jsonResponse({ 
          active: false,
          message: 'Session has expired'
        });
      }

      return jsonResponse({
        active: true,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastActivity: session.lastActivity,
        extensionsRemaining: session.extensionsRemaining,
        timeRemaining: Math.floor((expiresAt - now) / 1000) // seconds
      });
    }

    if (method === 'POST') {
      // Create or extend session
      const token = await requireAuth(request);
      if (!token) return new Response('Unauthorized', { status: 401 });
      
      const user = await validateDiscordToken(token);
      if (!user) return new Response('Invalid token', { status: 401 });

      const body = await request.json();
      const action = body.action; // 'create' or 'extend'

      const existingData = await env.PISHOCK_KV.get(sessionKey);
      
      if (action === 'extend') {
        if (!existingData) {
          return jsonResponse({ 
            error: 'No active session to extend' 
          }, 404);
        }

        const session: SessionStatus = JSON.parse(existingData);
        
        if (session.extensionsRemaining <= 0) {
          return jsonResponse({ 
            error: 'Maximum session extensions reached (3 max)',
            extensionsRemaining: 0
          }, 400);
        }

        // Extend session by 6 hours
        const currentExpiry = new Date(session.expiresAt);
        const newExpiry = new Date(currentExpiry.getTime() + (6 * 60 * 60 * 1000));
        
        const updatedSession: SessionStatus = {
          ...session,
          expiresAt: newExpiry.toISOString(),
          lastActivity: new Date().toISOString(),
          extensionsRemaining: session.extensionsRemaining - 1,
        };

        // Store with new TTL
        const ttl = Math.floor((newExpiry.getTime() - Date.now()) / 1000);
        await env.PISHOCK_KV.put(sessionKey, JSON.stringify(updatedSession), { 
          expirationTtl: ttl 
        });

        return jsonResponse({
          success: true,
          message: 'Session extended by 6 hours',
          session: updatedSession
        });
      } else {
        // Create new session
        const now = new Date();
        const expiresAt = new Date(now.getTime() + (6 * 60 * 60 * 1000)); // 6 hours

        const session: SessionStatus = {
          active: true,
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          lastActivity: now.toISOString(),
          extensionsRemaining: 3, // Allow 3 extensions (up to 24 hours total)
        };

        // Store with 6-hour expiration
        await env.PISHOCK_KV.put(sessionKey, JSON.stringify(session), { 
          expirationTtl: 21600 
        });

        return jsonResponse({
          success: true,
          message: 'Session created',
          session
        });
      }
    }

    if (method === 'DELETE') {
      // End session early
      const token = await requireAuth(request);
      if (!token) return new Response('Unauthorized', { status: 401 });
      
      const user = await validateDiscordToken(token);
      if (!user) return new Response('Invalid token', { status: 401 });

      await env.PISHOCK_KV.delete(sessionKey);
      
      return jsonResponse({
        success: true,
        message: 'Session ended'
      });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('Session status error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};
