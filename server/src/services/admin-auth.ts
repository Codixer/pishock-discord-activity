import type { AppEnv } from '../env.js';
import type { DataStore } from '../db/store.js';
import { validateDiscordTokenWithRefresh } from './token-utils.js';

const DEFAULT_OWNER_ADMIN_USER_IDS = '173839105615069184';

export function parseOwnerAdminUserIds(raw?: string | null): Set<string> {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const parts = trimmed
    ? trimmed.split(/[\n,]+/).map((id) => id.trim()).filter(Boolean)
    : [];
  const ids = parts.length > 0 ? parts : DEFAULT_OWNER_ADMIN_USER_IDS.split(/[\n,]+/).map((id) => id.trim()).filter(Boolean);
  return new Set(ids);
}

import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface AdminAuthResult {
  ok: boolean;
  status: ContentfulStatusCode;
  user?: Record<string, unknown>;
  error?: string;
}

export async function requireAdminUser(
  token: string | null,
  store: DataStore,
  env: Pick<AppEnv, 'DISCORD_CLIENT_ID' | 'DISCORD_CLIENT_SECRET' | 'OWNER_ADMIN_USER_IDS' | 'NODE_ENV'>
): Promise<AdminAuthResult> {
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' };

  const user = await validateDiscordTokenWithRefresh(token, store, env);
  if (!user?.id) return { ok: false, status: 401, error: 'Invalid token' };

  if (!parseOwnerAdminUserIds(env.OWNER_ADMIN_USER_IDS).has(String(user.id))) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true, status: 200, user };
}
