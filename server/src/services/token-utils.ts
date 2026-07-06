import type { AppEnv } from '../env.js';
import type { DataStore, TokenMetadata } from '../db/store.js';

const DEV_MOCK_TOKEN_PREFIX = 'dev_mock_token_';

function tryDevMockUser(token: string, nodeEnv: string): Record<string, unknown> | null {
  if (nodeEnv !== 'development' || !token.startsWith(DEV_MOCK_TOKEN_PREFIX)) {
    return null;
  }
  const userId = token.slice(DEV_MOCK_TOKEN_PREFIX.length);
  if (!userId) return null;

  const isDevUser = userId === 'dev_user_123';
  return {
    id: userId,
    username: isDevUser ? 'DevUser' : 'TestUser',
    discriminator: isDevUser ? '0001' : '0002',
    global_name: isDevUser ? 'Development User' : 'Test User',
    avatar: null,
    token_expires_at: Math.floor(Date.now() / 1000) + 86400 * 365,
  };
}

export function shouldRefreshToken(expiresAt: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return expiresAt - now < 3600;
}

export function isTokenExpired(expiresAt: number): boolean {
  return Math.floor(Date.now() / 1000) >= expiresAt;
}

export async function refreshDiscordToken(
  userId: string,
  store: DataStore,
  env: Pick<AppEnv, 'DISCORD_CLIENT_ID' | 'DISCORD_CLIENT_SECRET'>
): Promise<string | null> {
  try {
    const metadata = await store.getTokenMetadata(userId);
    if (!metadata?.refresh_token) return null;

    const params = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: metadata.refresh_token,
    });

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) return null;

    const newTokenData = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type?: string;
    };

    const expiresAt = Math.floor(Date.now() / 1000) + newTokenData.expires_in;
    const newMetadata: TokenMetadata = {
      access_token: newTokenData.access_token,
      refresh_token: newTokenData.refresh_token || metadata.refresh_token,
      expires_at: expiresAt,
      expires_in: newTokenData.expires_in,
      token_type: newTokenData.token_type || 'Bearer',
      user_id: userId,
      created_at: Math.floor(Date.now() / 1000),
    };

    await store.putTokenMetadata(userId, newMetadata);
    await store.putTokenValidation(
      newTokenData.access_token,
      userId,
      { id: userId, token_expires_at: expiresAt },
      newTokenData.expires_in - 60
    );

    return newTokenData.access_token;
  } catch {
    return null;
  }
}

export async function validateDiscordTokenWithRefresh(
  token: string,
  store: DataStore,
  env: Pick<AppEnv, 'DISCORD_CLIENT_ID' | 'DISCORD_CLIENT_SECRET'> & { NODE_ENV?: string }
): Promise<Record<string, unknown> | null> {
  try {
    const nodeEnv = env.NODE_ENV ?? process.env.NODE_ENV ?? 'production';
    const devMockUser = tryDevMockUser(token, nodeEnv);
    if (devMockUser) return devMockUser;

    const cached = await store.getTokenValidation(token);
    if (cached) {
      const expiresAt = Number(cached.token_expires_at || 0);
      if (expiresAt && shouldRefreshToken(expiresAt) && typeof cached.id === 'string') {
        await refreshDiscordToken(cached.id, store, env);
      }
      return cached;
    }

    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;

    const userData = await response.json() as Record<string, unknown>;
    const userId = String(userData.id || '');
    const metadata = userId ? await store.getTokenMetadata(userId) : null;
    const expiresAt = metadata?.expires_at || 0;
    const cacheTtl = expiresAt
      ? Math.max(60, expiresAt - Math.floor(Date.now() / 1000) - 60)
      : 10800;

    const payload = { ...userData, token_expires_at: expiresAt };
    await store.putTokenValidation(token, userId, payload, cacheTtl);
    return payload;
  } catch {
    return null;
  }
}
