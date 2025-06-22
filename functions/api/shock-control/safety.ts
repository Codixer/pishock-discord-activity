interface Env {
  PISHOCK_KV: KVNamespace;
}

interface SafetyRecord {
  userId: string;
  shocks: ShockRecord[];
  lastReset: string;
}

interface ShockRecord {
  timestamp: string;
  intensity: number;
  duration: number;
  shockerId: string;
}

interface SafetyLimits {
  maxShocksPerHour: number;
  minDelayBetweenShocks: number; // in seconds
  maxIntensity: number;
  maxDuration: number;
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

async function getSafetyRecord(kv: KVNamespace, userId: string): Promise<SafetyRecord> {
  const record = await kv.get(`safety:${userId}`);
  if (!record) {
    return {
      userId,
      shocks: [],
      lastReset: new Date().toISOString()
    };
  }
  return JSON.parse(record);
}

async function updateSafetyRecord(kv: KVNamespace, record: SafetyRecord): Promise<void> {
  await kv.put(`safety:${record.userId}`, JSON.stringify(record), {
    expirationTtl: 86400 // 24 hours
  });
}

function cleanOldShocks(shocks: ShockRecord[]): ShockRecord[] {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return shocks.filter(shock => new Date(shock.timestamp) > oneHourAgo);
}

function validateSafetyLimits(
  record: SafetyRecord, 
  limits: SafetyLimits, 
  newShock: { intensity: number; duration: number }
): { allowed: boolean; reason?: string; waitTime?: number } {
  // Clean old shocks first
  record.shocks = cleanOldShocks(record.shocks);
  
  // Check intensity limit
  if (newShock.intensity > limits.maxIntensity) {
    return {
      allowed: false,
      reason: `Intensity ${newShock.intensity}% exceeds maximum allowed ${limits.maxIntensity}%`
    };
  }
  
  // Check duration limit
  if (newShock.duration > limits.maxDuration) {
    return {
      allowed: false,
      reason: `Duration ${newShock.duration}s exceeds maximum allowed ${limits.maxDuration}s`
    };
  }
  
  // Check hourly limit
  if (record.shocks.length >= limits.maxShocksPerHour) {
    return {
      allowed: false,
      reason: `Hourly limit of ${limits.maxShocksPerHour} shocks reached`
    };
  }
  
  // Check minimum delay
  if (record.shocks.length > 0) {
    const lastShock = record.shocks[record.shocks.length - 1];
    const timeSinceLastShock = Date.now() - new Date(lastShock.timestamp).getTime();
    const minDelayMs = limits.minDelayBetweenShocks * 1000;
    
    if (timeSinceLastShock < minDelayMs) {
      const waitTime = Math.ceil((minDelayMs - timeSinceLastShock) / 1000);
      return {
        allowed: false,
        reason: `Minimum delay not met. Wait ${waitTime} seconds.`,
        waitTime
      };
    }
  }
  
  return { allowed: true };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
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

  const token = await requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  try {
    if (method === 'GET') {
      // Get safety status for user
      const userId = url.searchParams.get('userId');
      if (!userId) {
        return jsonResponse({ error: 'userId parameter required' }, 400);
      }

      const record = await getSafetyRecord(env.PISHOCK_KV, userId);
      record.shocks = cleanOldShocks(record.shocks);
      
      const now = Date.now();
      let cooldownRemaining = 0;
      
      if (record.shocks.length > 0) {
        const lastShock = record.shocks[record.shocks.length - 1];
        const timeSinceLastShock = now - new Date(lastShock.timestamp).getTime();
        const minDelayMs = 30 * 1000; // Default 30 seconds
        cooldownRemaining = Math.max(0, Math.ceil((minDelayMs - timeSinceLastShock) / 1000));
      }

      return jsonResponse({
        shocksInLastHour: record.shocks.length,
        isInCooldown: cooldownRemaining > 0,
        cooldownRemaining,
        lastShockTime: record.shocks.length > 0 ? record.shocks[record.shocks.length - 1].timestamp : null
      });
    }

    if (method === 'POST') {
      // Validate shock request
      const { userId, intensity, duration, limits, shockerId } = await request.json();
      
      if (!userId || !intensity || !duration || !shockerId) {
        return jsonResponse({ error: 'Missing required parameters' }, 400);
      }

      const safetyLimits: SafetyLimits = {
        maxShocksPerHour: limits?.maxShocksPerHour || 10,
        minDelayBetweenShocks: limits?.minDelayBetweenShocks || 30,
        maxIntensity: limits?.maxIntensity || 50,
        maxDuration: limits?.maxDuration || 5
      };

      const record = await getSafetyRecord(env.PISHOCK_KV, userId);
      const validation = validateSafetyLimits(record, safetyLimits, { intensity, duration });

      if (!validation.allowed) {
        return jsonResponse({
          allowed: false,
          reason: validation.reason,
          waitTime: validation.waitTime
        });
      }

      // Record the shock
      record.shocks.push({
        timestamp: new Date().toISOString(),
        intensity,
        duration,
        shockerId
      });

      await updateSafetyRecord(env.PISHOCK_KV, record);

      return jsonResponse({
        allowed: true,
        shocksRemaining: safetyLimits.maxShocksPerHour - record.shocks.length
      });
    }

    if (method === 'DELETE') {
      // Reset safety counters
      const userId = url.searchParams.get('userId');
      if (!userId) {
        return jsonResponse({ error: 'userId parameter required' }, 400);
      }

      await env.PISHOCK_KV.delete(`safety:${userId}`);
      return jsonResponse({ success: true, message: 'Safety counters reset' });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    console.error('Safety API error:', error);
    return jsonResponse({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
};