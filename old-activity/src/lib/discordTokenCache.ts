/**
 * Client-side cache for Discord OAuth access tokens (Embedded App SDK).
 * Uses sessionStorage + localStorage; never stores refresh_token.
 */

const STORAGE_PREFIX = 'pishock_discord_oauth:v1';

/** Ignore cache when actual expiry is within this window (ms). */
export const DISCORD_TOKEN_EXPIRY_SKEW_MS = 10 * 60 * 1000;

export interface DiscordTokenCacheEntry {
  access_token: string;
  /** ISO 8601 string from SDK authenticate() `expires` field */
  expires: string;
  userId: string;
  clientId: string;
}

function storageKey(clientId: string): string {
  return `${STORAGE_PREFIX}:${clientId}`;
}

export function readDiscordTokenCache(clientId: string): DiscordTokenCacheEntry | null {
  if (!clientId) return null;
  const key = storageKey(clientId);
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    /* private mode / quota */
  }
  if (!raw) {
    try {
      raw = localStorage.getItem(key);
    } catch {
      /* */
    }
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DiscordTokenCacheEntry;
    if (
      typeof parsed.access_token !== 'string' ||
      typeof parsed.expires !== 'string' ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.clientId !== 'string' ||
      parsed.clientId !== clientId
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeDiscordTokenCache(entry: DiscordTokenCacheEntry): void {
  const key = storageKey(entry.clientId);
  const raw = JSON.stringify(entry);
  try {
    sessionStorage.setItem(key, raw);
  } catch {
    /* */
  }
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* */
  }
}

export function clearDiscordTokenCache(clientId: string): void {
  if (!clientId) return;
  const key = storageKey(clientId);
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* */
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* */
  }
}

export function isCacheEntryUsable(entry: DiscordTokenCacheEntry): boolean {
  const exp = new Date(entry.expires).getTime();
  if (Number.isNaN(exp)) return false;
  return Date.now() + DISCORD_TOKEN_EXPIRY_SKEW_MS < exp;
}

/** Build cache entry from SDK authenticate() result */
export function authResultToCacheEntry(
  clientId: string,
  authResult: { access_token: string; expires: string; user: { id: string } }
): DiscordTokenCacheEntry {
  return {
    access_token: authResult.access_token,
    expires: authResult.expires,
    userId: authResult.user.id,
    clientId,
  };
}
