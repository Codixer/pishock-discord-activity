interface Env {
  PISHOCK_KV: KVNamespace;
}

interface ExecuteRequest {
  apiKey: string;
  username: string;
  shockerId: string;
  intensity: number;
  duration: number;
  operation: number; // 0 = shock, 1 = vibrate, 2 = beep
  safetyLimits?: {
    maxShocksPerHour: number;
    minDelayBetweenShocks: number;
    maxIntensity: number;
    maxDuration: number;
  };
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

async function validateSafety(
  kv: KVNamespace, 
  userId: string, 
  params: { intensity: number; duration: number; shockerId: string },
  limits: any
): Promise<{ allowed: boolean; reason?: string; waitTime?: number }> {
  const safetyResponse = await fetch('/api/shock-control/safety', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer dummy_token`
    },
    body: JSON.stringify({
      userId,
      intensity: params.intensity,
      duration: params.duration,
      shockerId: params.shockerId,
      limits
    })
  });

  if (!safetyResponse.ok) {
    return { allowed: false, reason: 'Safety validation failed' };
  }

  return await safetyResponse.json();
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

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  try {
    const executeData: ExecuteRequest = await request.json();
    const { 
      apiKey, 
      username, 
      shockerId, 
      intensity, 
      duration, 
      operation, 
      safetyLimits 
    } = executeData;

    console.log('CONTROL-EXECUTE: Starting shock control execution');
    console.log('CONTROL-EXECUTE: Shocker ID:', shockerId);
    console.log('CONTROL-EXECUTE: Operation:', operation, '(0=shock, 1=vibrate, 2=beep)');
    console.log('CONTROL-EXECUTE: Intensity:', intensity, 'Duration:', duration);

    // Validate required parameters
    if (!apiKey || !username || !shockerId || intensity < 1 || intensity > 100 || duration < 1 || duration > 15 || ![0, 1, 2].includes(operation)) {
      return jsonResponse({ 
        success: false, 
        error: 'Invalid parameters provided' 
      }, 400);
    }

    // Validate safety limits if provided (for shock operations)
    if (operation === 0 && safetyLimits) {
      console.log('CONTROL-EXECUTE: Validating safety limits for shock operation');
      
      const safetyValidation = await validateSafety(
        env.PISHOCK_KV, 
        'control_user', // Use a generic user ID for the control system
        { intensity, duration, shockerId },
        safetyLimits
      );

      if (!safetyValidation.allowed) {
        console.log('CONTROL-EXECUTE: Safety validation failed:', safetyValidation.reason);
        return jsonResponse({ 
          success: false, 
          error: safetyValidation.reason,
          waitTime: safetyValidation.waitTime
        });
      }
    }

    try {
      // Execute command using PiShock v3 API
      const operationNames = ['shock', 'vibrate', 'beep'];
      const operationName = operationNames[operation];
      
      console.log('CONTROL-EXECUTE: Sending', operationName, 'command via v3 API');
      
      const payload = {
        code: shockerId,
        duration: duration,
        intensity: intensity,
        op: operation,
        apikey: apiKey,
        username: username,
        name: 'ShockControlSystem-v3',
        random: false,
        scale: false
      };
      
      console.log('CONTROL-EXECUTE: Request payload:', { 
        code: shockerId,
        duration: duration,
        intensity: intensity,
        op: operation,
        apikey: '***HIDDEN***',
        username: username,
        name: 'ShockControlSystem-v3',
        random: false,
        scale: false
      });
      
      const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'PiShock-Control-System/1.0'
        },
        body: JSON.stringify(payload),
      });

      console.log('CONTROL-EXECUTE: Response status:', response.status);
      
      const responseText = await response.text();
      console.log('CONTROL-EXECUTE: Response text:', responseText);

      if (!response.ok) {
        throw new Error(`PiShock API error: HTTP ${response.status} - ${responseText}`);
      }

      console.log('CONTROL-EXECUTE: ✓ Command executed successfully via v3 API');

      return jsonResponse({ 
        success: true, 
        message: `${operationName} command executed successfully`,
        operation: operationName,
        intensity,
        duration,
        response: responseText
      });

    } catch (error) {
      console.error('CONTROL-EXECUTE: PiShock execution failed:', error);
      return jsonResponse({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Command execution failed' 
      });
    }
  } catch (error) {
    console.error('CONTROL-EXECUTE: General error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};