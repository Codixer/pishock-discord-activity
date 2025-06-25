interface Env {
  PISHOCK_KV: KVNamespace;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
}

interface StoredTokenData {
  access_token: string;
  expires_at: number;
  user_id: string;
  username: string;
  global_name?: string;
  avatar?: string;
}

// Get stored valid token for a user, or null if expired/not found
export async function getValidTokenForUser(kv: KVNamespace, userId: string): Promise<string | null> {
  try {
    const tokenData = await kv.get(`discord_auth:access_token:${userId}`);
    if (!tokenData) {
      console.log('TOKEN_CACHE: No stored token found for user:', userId);
      return null;
    }

    const stored: StoredTokenData = JSON.parse(tokenData);
    const now = Date.now();
    
    if (now >= stored.expires_at) {
      console.log('TOKEN_CACHE: Stored token expired for user:', userId);
      await kv.delete(`discord_auth:access_token:${userId}`);
      return null;
    }

    console.log('TOKEN_CACHE: ✓ Valid cached token found for user:', userId);
    return stored.access_token;
  } catch (error) {
    console.error('TOKEN_CACHE: Error retrieving token:', error);
    return null;
  }
}

// Refresh an expired token using refresh token
export async function refreshUserToken(kv: KVNamespace, userId: string, env: Env): Promise<string | null> {
  try {
    const refreshToken = await kv.get(`discord_auth:refresh_token:${userId}`);
    if (!refreshToken) {
      console.log('TOKEN_REFRESH: No refresh token found for user:', userId);
      return null;
    }

    console.log('TOKEN_REFRESH: Attempting to refresh token for user:', userId);

    const params = new URLSearchParams();
    params.append('client_id', env.DISCORD_CLIENT_ID);
    params.append('client_secret', env.DISCORD_CLIENT_SECRET);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('TOKEN_REFRESH: Failed to refresh token:', error);
      // Clean up invalid refresh token
      await kv.delete(`discord_auth:refresh_token:${userId}`);
      return null;
    }

    const tokenData = await response.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Get user data with new token
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${access_token}` },
    });

    if (!userResponse.ok) {
      console.error('TOKEN_REFRESH: Failed to get user data with refreshed token');
      return null;
    }

    const userData = await userResponse.json();

    // Store new tokens
    const expiresAt = Date.now() + (expires_in * 1000) - 60000; // 1 minute early for safety
    const storedData: StoredTokenData = {
      access_token,
      expires_at: expiresAt,
      user_id: userData.id,
      username: userData.username,
      global_name: userData.global_name,
      avatar: userData.avatar
    };

    await Promise.all([
      kv.put(`discord_auth:access_token:${userId}`, JSON.stringify(storedData), { 
        expirationTtl: expires_in - 60 
      }),
      kv.put(`discord_auth:refresh_token:${userId}`, refresh_token)
    ]);

    console.log('TOKEN_REFRESH: ✓ Successfully refreshed token for user:', userId);
    return access_token;
  } catch (error) {
    console.error('TOKEN_REFRESH: Error refreshing token:', error);
    return null;
  }
}

// Validate a token - first check cache, then validate with Discord, then try refresh if needed
export async function validateDiscordToken(token: string, kv: KVNamespace, env?: Env): Promise<any> {
  try {
    console.log('TOKEN_VALIDATION: Starting validation process');
    
    // First, try direct validation with provided token
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    if (response.ok) {
      const userData = await response.json();
      console.log('TOKEN_VALIDATION: ✓ Direct token validation successful for user:', userData.id);
      return userData;
    }

    console.log('TOKEN_VALIDATION: Direct validation failed, status:', response.status);

    // If direct validation fails and we have env (for refresh), try to get user from token and refresh
    if (env && response.status === 401) {
      // Try to decode the token to get user ID (this is a simplified approach)
      // In a real implementation, you might want to parse the JWT or use a different approach
      console.log('TOKEN_VALIDATION: Attempting token refresh (requires user context)');
      // For now, we'll just return null since we don't have user context
      return null;
    }

    return null;
  } catch (error) {
    console.error('TOKEN_VALIDATION: Error during validation:', error);
    return null;
  }
}

// Get user info efficiently - uses cached data when possible
export async function getUserInfo(kv: KVNamespace, userId: string, token?: string): Promise<{ username: string; avatar?: string } | null> {
  try {
    // First, try to get from cached token data
    const tokenData = await kv.get(`discord_auth:access_token:${userId}`);
    if (tokenData) {
      const stored: StoredTokenData = JSON.parse(tokenData);
      const now = Date.now();
      
      if (now < stored.expires_at) {
        console.log('USER_INFO: Using cached user data for:', userId);
        return {
          username: stored.global_name || stored.username || 'Unknown User',
          avatar: stored.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${stored.avatar}.png` : undefined
        };
      }
    }

    // If no cached data or expired, fetch from Discord API
    if (token) {
      console.log('USER_INFO: Fetching fresh user data from Discord API for:', userId);
      const response = await fetch(`https://discord.com/api/users/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (response.ok) {
        const user = await response.json();
        console.log('USER_INFO: ✓ Fetched user data from Discord API');
        
        return {
          username: user.global_name || user.username || 'Unknown User',
          avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png` : undefined
        };
      }
    }

    console.warn('USER_INFO: Could not get user data for:', userId);
    return null;
  } catch (error) {
    console.error('USER_INFO: Error fetching user info:', error);
    return null;
  }
}