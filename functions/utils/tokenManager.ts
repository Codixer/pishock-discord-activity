// Token management utilities to reduce Discord API calls and KV operations

interface Env {
  PISHOCK_KV: KVNamespace;
}

// In-memory cache for frequently accessed tokens (per worker instance)
const tokenCache = new Map<string, { token: string; user: any; expires: number }>();
const TOKEN_CACHE_TTL = 300000; // 5 minutes in milliseconds

export async function getValidToken(userId: string, env: Env): Promise<{ token: string; user: any } | null> {
  try {
    // 1. Check in-memory cache first (fastest)
    const cacheKey = `token_${userId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      console.log('TOKEN_MANAGER: Using in-memory cached token for user:', userId);
      return { token: cached.token, user: cached.user };
    }

    // 2. Check KV for stored token
    const tokenKey = `discord_token:${userId}`;
    const storedToken = await env.PISHOCK_KV.get(tokenKey);
    
    if (!storedToken) {
      console.log('TOKEN_MANAGER: No stored token found for user:', userId);
      return null;
    }

    // 3. Validate token and get user info
    const validationResult = await validateTokenWithCache(storedToken, env);
    if (!validationResult) {
      console.log('TOKEN_MANAGER: Token validation failed, removing invalid token');
      await env.PISHOCK_KV.delete(tokenKey);
      tokenCache.delete(cacheKey);
      return null;
    }

    // 4. Cache in memory for quick access
    tokenCache.set(cacheKey, {
      token: storedToken,
      user: validationResult,
      expires: Date.now() + TOKEN_CACHE_TTL
    });

    console.log('TOKEN_MANAGER: ✓ Valid token found and cached for user:', userId);
    return { token: storedToken, user: validationResult };

  } catch (error) {
    console.error('TOKEN_MANAGER: Error getting valid token:', error);
    return null;
  }
}

export async function validateTokenWithCache(token: string, env: Env): Promise<any> {
  try {
    // Use shorter cache key with just token suffix
    const cacheKey = `token_val:${token.slice(-8)}`;
    const cached = await env.PISHOCK_KV.get(cacheKey);
    
    if (cached) {
      const cachedData = JSON.parse(cached);
      console.log('TOKEN_MANAGER: Using cached token validation');
      return cachedData;
    }

    console.log('TOKEN_MANAGER: Fetching fresh token validation from Discord');
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      console.log('TOKEN_MANAGER: Token validation failed:', response.status);
      return null;
    }

    const userData = await response.json();

    // Cache validation result for 30 minutes
    await env.PISHOCK_KV.put(cacheKey, JSON.stringify(userData), {
      expirationTtl: 1800 // 30 minutes
    });

    console.log('TOKEN_MANAGER: ✓ Token validated and cached');
    return userData;

  } catch (error) {
    console.error('TOKEN_MANAGER: Token validation error:', error);
    return null;
  }
}

export async function getUserInfoOptimized(userId: string, env: Env, token?: string): Promise<{ username: string; avatar?: string } | null> {
  try {
    // 1. Try user cache first (24 hour TTL)
    const userCacheKey = `discord_user:${userId}`;
    const cachedUser = await env.PISHOCK_KV.get(userCacheKey);
    
    if (cachedUser) {
      const user = JSON.parse(cachedUser);
      return {
        username: user.global_name || user.username || 'Unknown User',
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png` : undefined
      };
    }

    // 2. If no token provided, try to get one
    if (!token) {
      const tokenResult = await getValidToken(userId, env);
      if (tokenResult) {
        token = tokenResult.token;
      } else {
        console.log('USER_INFO_OPT: No valid token available for user:', userId);
        return null;
      }
    }

    // 3. Fetch from Discord API as last resort
    console.log('USER_INFO_OPT: Fetching user data from Discord API for:', userId);
    const response = await fetch(`https://discord.com/api/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (response.ok) {
      const user = await response.json();
      
      // Cache user data for 24 hours
      await env.PISHOCK_KV.put(userCacheKey, JSON.stringify(user), {
        expirationTtl: 86400 // 24 hours
      });

      console.log('USER_INFO_OPT: ✓ Fetched and cached user data');
      return {
        username: user.global_name || user.username || 'Unknown User',
        avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png` : undefined
      };
    } else {
      console.warn('USER_INFO_OPT: Failed to fetch user from Discord API:', response.status);
    }

  } catch (error) {
    console.error('USER_INFO_OPT: Error fetching user info:', error);
  }

  return null;
}

// Clean up expired in-memory cache entries
export function cleanupTokenCache() {
  const now = Date.now();
  for (const [key, value] of tokenCache.entries()) {
    if (value.expires <= now) {
      tokenCache.delete(key);
    }
  }
}

// Clean up every 5 minutes
setInterval(cleanupTokenCache, 300000);