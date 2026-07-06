import { requireAdminUser } from '../../_shared/admin-auth';
import { ACTIVITY_BATCH_KV_TTL_SECONDS } from '../../_shared/activity-batch-kv';

interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  OWNER_ADMIN_USER_IDS?: string;
}

interface PagesFunction<Environment = unknown> {
  (context: {
    request: Request;
    env: Environment;
    params: Record<string, string>;
    waitUntil: (promise: Promise<any>) => void;
    passThroughOnException: () => void;
  }): Promise<Response> | Response;
}

interface ActivityLogEntry {
  id: string;
  timestamp: string;
  executorUserId: string;
  executorUsername: string;
  executorAvatar?: string;
  targetUserId: string;
  targetUsername: string;
  targetAvatar?: string;
  action: 'shock' | 'vibrate' | 'beep';
  intensity: number;
  duration: number;
}

interface BatchedActivityLog {
  entries: ActivityLogEntry[];
  lastUpdated: string;
  totalCount: number;
}

interface TokenMetadata {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user_id?: string;
  created_at?: number;
}

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function getDateKey(offsetDays: number): string {
  const date = new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().split('T')[0];
}

function redactTokenMetadata(metadata: TokenMetadata | null): Record<string, any> | null {
  if (!metadata) return null;
  return {
    hasAccessToken: Boolean(metadata.access_token),
    hasRefreshToken: Boolean(metadata.refresh_token),
    expiresAt: metadata.expires_at || null,
    expiresIn: metadata.expires_in || null,
    tokenType: metadata.token_type || null,
    userId: metadata.user_id || null,
    createdAt: metadata.created_at || null,
  };
}

function sanitizeDiscordProfile(profile: any): any {
  if (!profile || typeof profile !== 'object') return null;
  return {
    id: profile.id || null,
    username: profile.username || null,
    discriminator: profile.discriminator || null,
    global_name: profile.global_name || null,
    avatar: profile.avatar || null,
  };
}

async function anonymizeDeletedUserInActivityLogs(kv: KVNamespace, userId: string): Promise<{
  batchesUpdated: number;
  entriesAnonymized: number;
}> {
  let batchesUpdated = 0;
  let entriesAnonymized = 0;

  for (let i = 0; i < 30; i++) {
    const batchKey = `activity:batch:${getDateKey(i)}`;
    const raw = await kv.get(batchKey);
    if (!raw) continue;

    let parsed: BatchedActivityLog;
    try {
      parsed = JSON.parse(raw) as BatchedActivityLog;
    } catch {
      continue;
    }

    let changed = false;
    const nextEntries = Array.isArray(parsed.entries)
      ? parsed.entries.map((entry) => {
          let nextEntry = entry;

          if (entry.targetUserId === userId) {
            nextEntry = {
              ...nextEntry,
              targetUsername: 'Deleted User',
              targetAvatar: undefined,
            };
            changed = true;
            entriesAnonymized++;
          }

          if (entry.executorUserId === userId) {
            nextEntry = {
              ...nextEntry,
              executorUsername: 'Deleted User',
              executorAvatar: undefined,
            };
            changed = true;
            entriesAnonymized++;
          }

          return nextEntry;
        })
      : [];

    if (!changed) continue;

    const nextBatch: BatchedActivityLog = {
      ...parsed,
      entries: nextEntries,
      lastUpdated: new Date().toISOString(),
    };
    await kv.put(batchKey, JSON.stringify(nextBatch), { expirationTtl: ACTIVITY_BATCH_KV_TTL_SECONDS });
    batchesUpdated++;
  }

  return { batchesUpdated, entriesAnonymized };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const userId = params.userId as string;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const authResult = await requireAdminUser(request, env);
  if (!authResult.ok) {
    return jsonResponse({ success: false, error: authResult.error }, authResult.status);
  }

  if (!userId) {
    return jsonResponse({ success: false, error: 'Missing userId parameter' }, 400);
  }

  try {
    if (request.method === 'GET') {
      const [tokenMetadataRaw, tokenRaw, userProfileRaw, userDataRaw, warningAcksRaw, statusCacheRaw] = await Promise.all([
        env.PISHOCK_KV.get(`discord_token_metadata:${userId}`),
        env.PISHOCK_KV.get(`discord_token:${userId}`),
        env.PISHOCK_KV.get(`discord_user:${userId}`),
        env.PISHOCK_KV.get(`user:${userId}:data`),
        env.PISHOCK_KV.get(`user:${userId}:warning_acks`),
        env.PISHOCK_KV.get(`cache:user_status:${userId}`),
      ]);

      const tokenMetadata = tokenMetadataRaw ? (JSON.parse(tokenMetadataRaw) as TokenMetadata) : null;
      const tokenValidationKey = tokenMetadata?.access_token
        ? `discord_token_validation:${String(tokenMetadata.access_token).slice(-8)}`
        : tokenRaw
          ? `discord_token_validation:${String(tokenRaw).slice(-8)}`
          : null;
      const tokenValidationRaw = tokenValidationKey ? await env.PISHOCK_KV.get(tokenValidationKey) : null;

      let parsedUserData: any = null;
      try {
        parsedUserData = userDataRaw ? JSON.parse(userDataRaw) : null;
      } catch {
        parsedUserData = { raw: userDataRaw };
      }

      let parsedWarningAcks: any = null;
      try {
        parsedWarningAcks = warningAcksRaw ? JSON.parse(warningAcksRaw) : null;
      } catch {
        parsedWarningAcks = { raw: warningAcksRaw };
      }

      let parsedStatusCache: any = null;
      try {
        parsedStatusCache = statusCacheRaw ? JSON.parse(statusCacheRaw) : null;
      } catch {
        parsedStatusCache = { raw: statusCacheRaw };
      }

      let profile: any = null;
      if (userProfileRaw) {
        try {
          profile = sanitizeDiscordProfile(JSON.parse(userProfileRaw));
        } catch {
          profile = null;
        }
      }

      return jsonResponse({
        success: true,
        userId,
        data: {
          tokens: {
            metadata: redactTokenMetadata(tokenMetadata),
            hasLegacyToken: Boolean(tokenRaw),
            validationCacheKey: tokenValidationKey,
            hasValidationCache: Boolean(tokenValidationRaw),
          },
          discordUserProfile: profile,
          userData: parsedUserData,
          warningAcks: parsedWarningAcks,
          userStatusCache: parsedStatusCache,
          knownKeys: [
            `discord_token_metadata:${userId}`,
            `discord_token:${userId}`,
            `discord_user:${userId}`,
            tokenValidationKey,
            `user:${userId}:data`,
            `user:${userId}:warning_acks`,
            `cache:user_status:${userId}`,
            `user_status_cache:${userId}`,
          ].filter(Boolean),
        },
      });
    }

    if (request.method === 'DELETE') {
      const body = await request.json().catch(() => ({}));
      const confirmUserId = typeof body.confirmUserId === 'string' ? body.confirmUserId : '';
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!confirmUserId || confirmUserId !== userId) {
        return jsonResponse({ success: false, error: 'Confirmation failed: confirmUserId must match target userId' }, 400);
      }
      if (!reason) {
        return jsonResponse({ success: false, error: 'A deletion reason is required' }, 400);
      }

      const tokenMetadataRaw = await env.PISHOCK_KV.get(`discord_token_metadata:${userId}`);
      const tokenRaw = await env.PISHOCK_KV.get(`discord_token:${userId}`);
      const tokenMetadata = tokenMetadataRaw ? (JSON.parse(tokenMetadataRaw) as TokenMetadata) : null;

      const tokenValidationCandidates = new Set<string>();
      if (tokenMetadata?.access_token) {
        tokenValidationCandidates.add(`discord_token_validation:${String(tokenMetadata.access_token).slice(-8)}`);
      }
      if (tokenRaw) {
        tokenValidationCandidates.add(`discord_token_validation:${String(tokenRaw).slice(-8)}`);
      }

      const keysToDelete = [
        `discord_token_metadata:${userId}`,
        `discord_token:${userId}`,
        `discord_user:${userId}`,
        ...Array.from(tokenValidationCandidates),
        `user:${userId}:data`,
        `user:${userId}:warning_acks`,
        `cache:user_status:${userId}`,
        `user_status_cache:${userId}`,
      ];

      const deleteResults = await Promise.allSettled(keysToDelete.map((key) => env.PISHOCK_KV.delete(key)));
      const failedDeletes = deleteResults
        .map((result, index) =>
          result.status === 'rejected'
            ? { key: keysToDelete[index], error: String(result.reason) }
            : null
        )
        .filter(Boolean) as Array<{ key: string; error: string }>;

      if (failedDeletes.length > 0) {
        return jsonResponse(
          {
            success: false,
            userId,
            reason,
            error: 'One or more KV delete operations failed',
            failedKeys: failedDeletes.map((f) => f.key),
            failedDetails: failedDeletes,
          },
          500
        );
      }

      const activityResult = await anonymizeDeletedUserInActivityLogs(env.PISHOCK_KV, userId);

      return jsonResponse({
        success: true,
        userId,
        reason,
        deletedKeys: keysToDelete,
        activityLog: activityResult,
      });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process admin user request',
      },
      500
    );
  }
};
