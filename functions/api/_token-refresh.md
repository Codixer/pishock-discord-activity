# Token Refresh Implementation Plan

## Current Problems

1. **refresh_token is extracted but never stored**
2. **No token expiry checking** - relies on Discord API to reject
3. **No automatic token refresh** when expired
4. **Validation cache TTL doesn't match token expiry**

## Proposed Fix

### 1. Update OAuth Handler (`auth/discord.ts`)

Store complete token metadata:

```typescript
// Store token metadata (NEW structure)
await env.PISHOCK_KV.put(
  `discord_token_metadata:${user.id}`,
  JSON.stringify({
    access_token,
    refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + expires_in,
    token_type,
    user_id: user.id
  }),
  { expirationTtl: expires_in + 86400 } // Extra day buffer
);

// Keep validation cache in sync with token expiry
await env.PISHOCK_KV.put(
  `discord_token_validation:${access_token.slice(-8)}`,
  JSON.stringify(user),
  { expirationTtl: expires_in - 60 } // Match token expiry
);
```

### 2. Create Token Refresh Function

```typescript
async function refreshDiscordToken(
  userId: string, 
  kv: KVNamespace, 
  env: Env
): Promise<string | null> {
  // Get stored token metadata
  const metadataStr = await kv.get(`discord_token_metadata:${userId}`);
  if (!metadataStr) return null;
  
  const metadata = JSON.parse(metadataStr);
  
  // Refresh the token
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
  
  if (!response.ok) return null;
  
  const newTokenData = await response.json();
  const { access_token, refresh_token, expires_in } = newTokenData;
  
  // Update stored metadata
  await kv.put(
    `discord_token_metadata:${userId}`,
    JSON.stringify({
      access_token,
      refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + expires_in,
      token_type: 'Bearer',
      user_id: userId
    }),
    { expirationTtl: expires_in + 86400 }
  );
  
  return access_token;
}
```

### 3. Update validateDiscordToken()

```typescript
async function validateDiscordToken(
  token: string, 
  kv: KVNamespace,
  env: Env
): Promise<any> {
  const cacheKey = `discord_token_validation:${token.slice(-8)}`;
  
  // Check cache first
  const cached = await kv.get(cacheKey);
  if (cached) {
    const userData = JSON.parse(cached);
    
    // Check if we need to refresh the token
    const metadataStr = await kv.get(`discord_token_metadata:${userData.id}`);
    if (metadataStr) {
      const metadata = JSON.parse(metadataStr);
      const now = Math.floor(Date.now() / 1000);
      
      // If token expires in less than 1 hour, refresh it proactively
      if (metadata.expires_at - now < 3600) {
        await refreshDiscordToken(userData.id, kv, env);
      }
    }
    
    return userData;
  }
  
  // Cache miss - validate with Discord
  const response = await fetch('https://discord.com/api/users/@me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    // Token invalid/expired - try to refresh if we have metadata
    // (Would need to get user ID from token somehow, or return error)
    throw new Error('Invalid Discord token');
  }
  
  const userData = await response.json();
  
  // Cache the validation
  await kv.put(cacheKey, JSON.stringify(userData), {
    expirationTtl: 10800 // 3 hours
  });
  
  return userData;
}
```

## Benefits

✅ Tokens automatically refresh before expiry
✅ No failed requests due to expired tokens
✅ Refresh tokens properly stored and used
✅ Validation cache matches actual token lifetime
✅ Proactive refresh prevents user disruption

## Migration Notes

- Existing sessions will need to re-authenticate (one-time)
- New structure uses `discord_token_metadata` instead of `discord_token`
- Old keys will naturally expire
