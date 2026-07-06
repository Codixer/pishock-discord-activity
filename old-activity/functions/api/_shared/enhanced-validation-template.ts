// COPY THIS TO ALL ENDPOINTS THAT NEED TOKEN VALIDATION WITH REFRESH
// Replace the existing validateDiscordToken function with this enhanced version

// 1. Update Env interface to include Discord credentials:
interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  // ... other env vars
}

// 2. Add the token refresh function:
async function refreshDiscordToken(userId: string, kv: KVNamespace, env: Env): Promise<string | null> {
  try {
    if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
      return null;
    }

    const metadataStr = await kv.get(`discord_token_metadata:${userId}`);
    if (!metadataStr) return null;

    const metadata = JSON.parse(metadataStr);
    if (!metadata.refresh_token) return null;

    console.log(`Refreshing token for user ${userId}`);

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
      console.error(`Token refresh failed for user ${userId}`);
      return null;
    }

    const newTokenData = await response.json();
    const { access_token, refresh_token, expires_in } = newTokenData;
    const expiresAt = Math.floor(Date.now() / 1000) + expires_in;

    await Promise.all([
      kv.put(`discord_token_metadata:${userId}`, JSON.stringify({
        access_token,
        refresh_token: refresh_token || metadata.refresh_token,
        expires_at: expiresAt,
        expires_in,
        token_type: 'Bearer',
        user_id: userId,
        created_at: Math.floor(Date.now() / 1000)
      }), { expirationTtl: expires_in + 86400 }),
      kv.put(`discord_token:${userId}`, access_token, { expirationTtl: expires_in - 60 }),
      kv.put(`discord_token_validation:${access_token.slice(-8)}`, JSON.stringify({
        id: userId,
        token_expires_at: expiresAt
      }), {
        expirationTtl: expires_in - 60 // Match token expiry
      })
    ]);

    console.log(`Token refreshed successfully for user ${userId}`);
    return access_token;
  } catch (error) {
    console.error(`Error refreshing token for user ${userId}:`, error);
    return null;
  }
}

// 3. Replace validateDiscordToken with this version:
async function validateDiscordToken(token: string, kv: KVNamespace, env?: Env): Promise<any> {
  try {
    const cacheKey = `discord_token_validation:${token.slice(-8)}`;
    const cached = await kv.get(cacheKey);
    
    if (cached) {
      const cachedData = JSON.parse(cached);
      
      // Check if token is expiring soon (< 1 hour) and refresh if possible
      if (env && cachedData.token_expires_at) {
        const now = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = cachedData.token_expires_at - now;
        
        if (timeUntilExpiry < 3600 && timeUntilExpiry > 0) {
          console.log(`Token expiring soon for user ${cachedData.id}, refreshing in background`);
          refreshDiscordToken(cachedData.id, kv, env).catch(() => {});
        }
      }
      
      return cachedData;
    }
    
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error('Invalid Discord token');
    }
    
    const userData = await response.json();
    
    // Try to get expiry info from metadata
    let expiresAt = 0;
    let cacheTtl = 10800; // Default 3 hours if no metadata
    const metadataStr = await kv.get(`discord_token_metadata:${userData.id}`);
    if (metadataStr) {
      const metadata = JSON.parse(metadataStr);
      expiresAt = metadata.expires_at;
      // Use remaining token lifetime for cache TTL
      const now = Math.floor(Date.now() / 1000);
      const remainingTime = expiresAt - now;
      cacheTtl = Math.max(60, remainingTime - 60); // At least 1 minute
    }
    
    await kv.put(cacheKey, JSON.stringify({
      ...userData,
      token_expires_at: expiresAt
    }), {
      expirationTtl: cacheTtl // Match token expiry
    });
    
    return userData;
  } catch (error) {
    return null;
  }
}

// 4. Update the call to validateDiscordToken to pass env:
// OLD: const user = await validateDiscordToken(token, env.PISHOCK_KV);
// NEW: const user = await validateDiscordToken(token, env.PISHOCK_KV, env);
