import { validateDiscordTokenWithRefresh } from './token-utils';

/** Default allowlist when `OWNER_ADMIN_USER_IDS` is unset (backward compatible). */
const DEFAULT_OWNER_ADMIN_USER_IDS = '173839105615069184';

export function parseOwnerAdminUserIds(raw?: string | null): Set<string> {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const parts = trimmed
    ? trimmed
        .split(/[\n,]+/)
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    : [];
  const ids = parts.length > 0 ? parts : DEFAULT_OWNER_ADMIN_USER_IDS.split(/[\n,]+/).map((id) => id.trim()).filter(Boolean);
  return new Set(ids);
}

function ownerAdminIdSet(env: AdminAuthEnv): Set<string> {
  return parseOwnerAdminUserIds(env.OWNER_ADMIN_USER_IDS);
}

export interface AdminAuthEnv {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  /** Comma- or newline-separated Discord user IDs allowed to call admin APIs. */
  OWNER_ADMIN_USER_IDS?: string;
}

export interface AdminAuthResult {
  ok: boolean;
  status: number;
  user?: any;
  error?: string;
}

export function requireBearerToken(request: Request): string | null {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

export async function requireAdminUser(
  request: Request,
  env: AdminAuthEnv
): Promise<AdminAuthResult> {
  const token = requireBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const user = await validateDiscordTokenWithRefresh(token, env.PISHOCK_KV, {
    PISHOCK_KV: env.PISHOCK_KV,
    DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID || '',
    DISCORD_CLIENT_SECRET: env.DISCORD_CLIENT_SECRET || '',
  });

  if (!user?.id) {
    return { ok: false, status: 401, error: 'Invalid token' };
  }

  if (!ownerAdminIdSet(env).has(user.id)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true, status: 200, user };
}
