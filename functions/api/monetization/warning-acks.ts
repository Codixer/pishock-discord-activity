import { validateDiscordTokenWithRefresh } from '../_shared/token-utils';

interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
}

interface WarningAckState {
  hasSeenFirstBypassWarning: boolean;
  hasSeenFirstOverlimitPurchaseWarning: boolean;
  updatedAt?: string;
}

function jsonResponse(body: any, status = 200, additionalHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...additionalHeaders,
    },
  });
}

function createPerformanceHeaders(
  startedAtMs: number,
  kvReads: number,
  kvWrites: number
): Record<string, string> {
  const totalMs = Math.max(0, Date.now() - startedAtMs);
  return {
    'X-Response-Time-Ms': String(totalMs),
    'X-KV-Reads-Estimate': String(kvReads),
    'X-KV-Writes-Estimate': String(kvWrites),
    'Server-Timing': `app;dur=${totalMs},warningAcks;dur=${totalMs}`,
  };
}

function requireAuth(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

function warningAckKey(userId: string): string {
  return `user:${userId}:warning_acks`;
}

function getDefaultWarningState(): WarningAckState {
  return {
    hasSeenFirstBypassWarning: false,
    hasSeenFirstOverlimitPurchaseWarning: false,
  };
}

function parseStoredWarningState(raw: string | null): WarningAckState {
  if (!raw) return getDefaultWarningState();
  try {
    return { ...getDefaultWarningState(), ...JSON.parse(raw) };
  } catch (error) {
    console.error('warning_acks: failed to parse KV payload, resetting to defaults', error);
    return getDefaultWarningState();
  }
}

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  const startedAtMs = Date.now();
  let kvReads = 0;
  let kvWrites = 0;
  const trackedKv: KVNamespace = {
    get: async (key: string) => {
      kvReads += 1;
      return env.PISHOCK_KV.get(key);
    },
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      kvWrites += 1;
      return env.PISHOCK_KV.put(key, value, options);
    },
    delete: async (key: string) => {
      kvWrites += 1;
      return env.PISHOCK_KV.delete(key);
    },
  };

  const respond = (body: any, status = 200, headers: Record<string, string> = {}) =>
    jsonResponse(body, status, {
      ...headers,
      ...createPerformanceHeaders(startedAtMs, kvReads, kvWrites),
    });

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const token = requireAuth(request);
  if (!token) return new Response('Unauthorized', { status: 401 });

  const user = await validateDiscordTokenWithRefresh(token, trackedKv, {
    PISHOCK_KV: trackedKv,
    DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID || '',
    DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET || '',
  });
  if (!user?.id) return new Response('Invalid token', { status: 401 });

  try {
    const key = warningAckKey(user.id);

    if (request.method === 'GET') {
      const existingStateRaw = await trackedKv.get(key);
      const existingState = parseStoredWarningState(existingStateRaw);
      return respond({
        userId: user.id,
        ...existingState,
      });
    }

    const body = await request.json().catch(() => ({}));
    const hasBypassUpdate = typeof body.hasSeenFirstBypassWarning === 'boolean';
    const hasPurchaseUpdate = typeof body.hasSeenFirstOverlimitPurchaseWarning === 'boolean';
    if (!hasBypassUpdate && !hasPurchaseUpdate) {
      return jsonResponse(
        {
          success: false,
          error:
            'Expected hasSeenFirstBypassWarning and/or hasSeenFirstOverlimitPurchaseWarning boolean fields.',
        },
        400
      );
    }

    const latestRaw = await trackedKv.get(key);
    const latest = parseStoredWarningState(latestRaw);
    const merged: WarningAckState = {
      hasSeenFirstBypassWarning: hasBypassUpdate
        ? latest.hasSeenFirstBypassWarning || Boolean(body.hasSeenFirstBypassWarning)
        : latest.hasSeenFirstBypassWarning,
      hasSeenFirstOverlimitPurchaseWarning: hasPurchaseUpdate
        ? latest.hasSeenFirstOverlimitPurchaseWarning ||
          Boolean(body.hasSeenFirstOverlimitPurchaseWarning)
        : latest.hasSeenFirstOverlimitPurchaseWarning,
      updatedAt: new Date().toISOString(),
    };

    const unchanged =
      merged.hasSeenFirstBypassWarning === latest.hasSeenFirstBypassWarning &&
      merged.hasSeenFirstOverlimitPurchaseWarning === latest.hasSeenFirstOverlimitPurchaseWarning;
    if (!unchanged) {
      await trackedKv.put(key, JSON.stringify(merged));
    }

    return respond({
      success: true,
      userId: user.id,
      noOp: unchanged,
      ...merged,
    });
  } catch (error) {
    return respond(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update warning acknowledgements',
      },
      500
    );
  }
};
