// Shared token management utilities for Discord OAuth

interface TokenMetadata {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp
  expires_in: number;
  token_type: string;
  user_id: string;
  created_at: number;
}

interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
}

/**
 * Refresh an expired or expiring Discord access token
 * @param userId - Discord user ID
 * @param kv - KV namespace
 * @param env - Environment with Discord credentials
 * @returns New access token or null if refresh failed
 */
export async function refreshDiscordToken(
  userId: string,
  kv: KVNamespace,
  env: Env
): Promise<string | null> {
  try {
    // Get stored token metadata
    const metadataStr = await kv.get(`discord_token_metadata:${userId}`);
    if (!metadataStr) {
      console.log(`No token metadata found for user ${userId}`);
      return null;
    }

    const metadata: TokenMetadata = JSON.parse(metadataStr);

    // Check if we have a refresh token
    if (!metadata.refresh_token) {
      console.log(`No refresh token available for user ${userId}`);
      return null;
    }

    console.log(`Refreshing token for user ${userId}, current token expires at ${new Date(metadata.expires_at * 1000).toISOString()}`);

    // Request new token from Discord
    const params = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: metadata.refresh_token
    });

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Token refresh failed for user ${userId}:`, errorText);
      return null;
    }

    const newTokenData = await response.json();
    const { access_token, refresh_token, expires_in, token_type } = newTokenData;

    const expiresAt = Math.floor(Date.now() / 1000) + expires_in;

    // Update stored metadata with new tokens
    const newMetadata: TokenMetadata = {
      access_token,
      refresh_token: refresh_token || metadata.refresh_token, // Use new or keep old
      expires_at: expiresAt,
      expires_in,
      token_type: token_type || 'Bearer',
      user_id: userId,
      created_at: Math.floor(Date.now() / 1000)
    };

    await Promise.all([
      // Update token metadata
      kv.put(
        `discord_token_metadata:${userId}`,
        JSON.stringify(newMetadata),
        { expirationTtl: expires_in + 86400 } // Token lifetime + 1 day buffer
      ),
      
      // Update legacy token storage
      kv.put(`discord_token:${userId}`, access_token, {
        expirationTtl: expires_in - 60
      }),
      
      // Update validation cache with new token
      kv.put(`discord_token_validation:${access_token.slice(-8)}`, JSON.stringify({
        id: userId,
        token_expires_at: expiresAt
      }), {
        expirationTtl: expires_in - 60
      })
    ]);

    console.log(`Token refreshed successfully for user ${userId}, new token expires at ${new Date(expiresAt * 1000).toISOString()}`);

    return access_token;
  } catch (error) {
    console.error(`Error refreshing token for user ${userId}:`, error);
    return null;
  }
}

/**
 * Check if a token needs refresh (expires in less than 1 hour)
 * @param expiresAt - Unix timestamp when token expires
 * @returns true if token should be refreshed
 */
export function shouldRefreshToken(expiresAt: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = expiresAt - now;
  
  // Refresh if less than 1 hour until expiry
  return timeUntilExpiry < 3600;
}

/**
 * Check if a token is expired
 * @param expiresAt - Unix timestamp when token expires
 * @returns true if token is expired
 */
export function isTokenExpired(expiresAt: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now >= expiresAt;
}

/**
 * Enhanced token validation with automatic refresh
 * @param token - The access token to validate
 * @param kv - KV namespace
 * @param env - Environment with Discord credentials
 * @returns User data or null if invalid
 */
export async function validateDiscordTokenWithRefresh(
  token: string,
  kv: KVNamespace,
  env: Env
): Promise<any> {
  try {
    const cacheKey = `discord_token_validation:${token.slice(-8)}`;
    
    // Check cache first
    const cached = await kv.get(cacheKey);
    if (cached) {
      const cachedData = JSON.parse(cached);
      
      // If we have expiry info and token is expiring soon, refresh it
      if (cachedData.token_expires_at && shouldRefreshToken(cachedData.token_expires_at)) {
        console.log(`Token expiring soon for user ${cachedData.id}, attempting refresh...`);
        const newToken = await refreshDiscordToken(cachedData.id, kv, env);
        
        if (newToken) {
          console.log(`Token refreshed successfully, new token: ${newToken.slice(-8)}`);
          // Note: Client will get 401 on next request with old token and should re-authenticate
        } else {
          console.warn(`Token refresh failed for user ${cachedData.id}`);
        }
      }
      
      return cachedData;
    }
    
    // Cache miss - validate with Discord API
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      // Token is invalid or expired
      throw new Error('Invalid Discord token');
    }
    
    const userData = await response.json();
    
    // Try to get expiry info from metadata
    const metadataStr = await kv.get(`discord_token_metadata:${userData.id}`);
    let expiresAt = 0;
    let cacheTtl = 10800; // Default 3 hours if no metadata
    
    if (metadataStr) {
      const metadata: TokenMetadata = JSON.parse(metadataStr);
      expiresAt = metadata.expires_at;
      // Use remaining token lifetime for cache TTL
      const now = Math.floor(Date.now() / 1000);
      const remainingTime = expiresAt - now;
      cacheTtl = Math.max(60, remainingTime - 60); // At least 1 minute
    }
    
    // Cache the validation
    await kv.put(cacheKey, JSON.stringify({
      ...userData,
      token_expires_at: expiresAt
    }), {
      expirationTtl: cacheTtl // Match token expiry
    });
    
    return userData;
  } catch (error) {
    console.error('Token validation error:', error);
    return null;
  }
}
