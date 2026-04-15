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

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
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

  const user = await validateDiscordTokenWithRefresh(token, env.PISHOCK_KV, {
    PISHOCK_KV: env.PISHOCK_KV,
    DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID || '',
    DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET || '',
  });
  if (!user?.id) return new Response('Invalid token', { status: 401 });

  try {
    const key = warningAckKey(user.id);

    if (request.method === 'GET') {
      const existingStateRaw = await env.PISHOCK_KV.get(key);
      const existingState = parseStoredWarningState(existingStateRaw);
      return jsonResponse({
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

    let lastMerged: WarningAckState | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const latestRaw = await env.PISHOCK_KV.get(key);
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
      await env.PISHOCK_KV.put(key, JSON.stringify(merged));
      const verify = parseStoredWarningState(await env.PISHOCK_KV.get(key));
      const bypassOk =
        !hasBypassUpdate ||
        !merged.hasSeenFirstBypassWarning ||
        verify.hasSeenFirstBypassWarning;
      const purchaseOk =
        !hasPurchaseUpdate ||
        !merged.hasSeenFirstOverlimitPurchaseWarning ||
        verify.hasSeenFirstOverlimitPurchaseWarning;
      lastMerged = merged;
      if (bypassOk && purchaseOk) {
        break;
      }
    }

    return jsonResponse({
      success: true,
      userId: user.id,
      ...lastMerged!,
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update warning acknowledgements',
      },
      500
    );
  }
};
