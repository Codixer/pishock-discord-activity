// Middleware to COMPLETELY prevent any Cloudflare script injection

// Cache API helper for programmatic caching
async function getCachedResponse(request: Request, cacheKey: string): Promise<Response | null> {
  try {
    const cache = caches.default;
    const cacheRequest = new Request(cacheKey, request);
    return await cache.match(cacheRequest);
  } catch (error) {
    console.warn('Cache read error:', error);
    return null;
  }
}

async function setCachedResponse(request: Request, response: Response, cacheKey: string, maxAge: number): Promise<void> {
  try {
    const cache = caches.default;
    const cacheRequest = new Request(cacheKey, request);
    const responseToCache = response.clone();
    
    // Add cache headers
    responseToCache.headers.set('Cache-Control', `public, max-age=${maxAge}`);
    responseToCache.headers.set('X-Cache-Status', 'MISS');
    
    await cache.put(cacheRequest, responseToCache);
  } catch (error) {
    console.warn('Cache write error:', error);
  }
  DISCORD_BOT_TOKEN?: string;
}

// Discord instance verification
async function verifyDiscordInstance(instanceId: string, botToken: string): Promise<boolean> {
  if (!botToken || !instanceId) {
    return true; // Skip verification if no bot token configured
  }
  
  try {
    // Extract application ID from the instance ID format
    // Format: i-{launch_id}-gc-{guild_id}-{channel_id}
    const parts = instanceId.split('-');
    if (parts.length < 2) {
      console.warn('Invalid instance ID format:', instanceId);
      return true; // Allow if format is unexpected
    }
    
    // For now, we'll assume the application ID is embedded in the environment
    // In a real implementation, you'd extract it from the instance ID or store it separately
    const applicationId = process.env.VITE_DISCORD_CLIENT_ID || process.env.DISCORD_CLIENT_ID;
    if (!applicationId) {
      console.warn('No application ID available for instance verification');
      return true;
    }
    
    const response = await fetch(
      `https://discord.com/api/applications/${applicationId}/activity-instances/${instanceId}`,
      {
        headers: {
          'Authorization': botToken,
          'User-Agent': 'PiShock-Discord-Activity/4.0'
        }
      }
    );
    
    const isValid = response.ok;
    console.log(`Instance ${instanceId} verification: ${isValid ? 'valid' : 'invalid'} (${response.status})`);
    
    return isValid;
  } catch (error) {
    console.error('Discord instance verification failed:', error);
    return true; // Allow on error to prevent blocking legitimate requests
  }
}

// Cleanup inactive instance data
async function cleanupInstanceData(kv: KVNamespace, instanceId: string): Promise<void> {
  try {
    console.log(`Cleaning up data for inactive instance: ${instanceId}`);
    
    // List of keys to clean up for this instance
    const keysToDelete = [
      `instance_data:${instanceId}`,
      `instance:${instanceId}:pishock`,
      `instance:${instanceId}:pishock:lastTested`,
      `instance:${instanceId}:pishock:configuredBy`
    ];
    
    // Delete all instance-specific keys
    await Promise.all(keysToDelete.map(key => kv.delete(key)));
    
    console.log(`Cleaned up ${keysToDelete.length} keys for instance ${instanceId}`);
  } catch (error) {
    console.error(`Failed to cleanup instance ${instanceId}:`, error);
  }
}

export async function onRequest(context: any) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Check for instance-specific API endpoints and verify Discord instance
  const instanceMatch = url.pathname.match(/^\/api\/instances\/([^\/]+)/);
  if (instanceMatch && env.DISCORD_BOT_TOKEN) {
    const instanceId = instanceMatch[1];
    const isValid = await verifyDiscordInstance(instanceId, env.DISCORD_BOT_TOKEN);
    
    if (!isValid) {
      // Instance is no longer active, clean up data and return 410 Gone
      await cleanupInstanceData(env.PISHOCK_KV, instanceId);
      
      return new Response(JSON.stringify({
        error: 'Instance no longer active',
        message: 'This Discord Activity instance has been closed. Please restart the activity.',
        code: 'INSTANCE_INACTIVE'
      }), {
        status: 410,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
  
  // Check for cached response for GET requests to specific endpoints
  if (request.method === 'GET') {
    const cachePaths = [
      '/api/users/',
      '/api/discord/guilds/',
      '/api/activity-log'
    ];
    
    const shouldCache = cachePaths.some(path => url.pathname.includes(path));
    
    if (shouldCache) {
      const cacheKey = `${url.origin}${url.pathname}${url.search}`;
      const cachedResponse = await getCachedResponse(request, cacheKey);
      
      if (cachedResponse) {
        // Return cached response with HIT status
        const response = cachedResponse.clone();
        response.headers.set('X-Cache-Status', 'HIT');
        return response;
      }
    }
  }
  
  // Get the response first
  const response = await context.next();
  
  // Cache successful GET responses
  if (request.method === 'GET' && response.status === 200) {
    const cachePaths = [
      { path: '/api/users/', maxAge: 120 }, // 2 minutes
      { path: '/api/discord/guilds/', maxAge: 300 }, // 5 minutes  
      { path: '/api/activity-log', maxAge: 30 } // 30 seconds
    ];
    
    const cacheConfig = cachePaths.find(config => url.pathname.includes(config.path));
    
    if (cacheConfig) {
      const cacheKey = `${url.origin}${url.pathname}${url.search}`;
      // Don't await - cache in background
      setCachedResponse(request, response, cacheKey, cacheConfig.maxAge);
    }
  }
  
  // Clone the response so we can modify headers
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers)
  });
  
  // NUCLEAR OPTION: Disable EVERY possible Cloudflare feature
  const cloudflareHeaders = {
    'CF-Analytics': 'off',
    'CF-Web-Analytics': 'off',
    'CF-Browser-Insights': 'off',
    'CF-Ray': 'off',
    'CF-Cache-Status': 'BYPASS',
    'CF-Polish': 'off',
    'CF-Mirage': 'off',
    'CF-Rocket-Loader': 'off',
    'CF-Auto-Minify': 'off',
    'CF-ScrapeShield': 'off',
    'CF-APO-Bypass': '1',
    'CF-Speed-Brain': 'off',
    'CF-Apps': 'off',
    'CF-Cron-Trigger': 'off',
    'CF-Early-Hints': 'off',
    'CF-Bot-Management': 'off',
    'CF-Zone-Id': 'bypass',
    'CF-Worker': 'bypass'
  };
  
  // Apply all Cloudflare disabling headers
  Object.entries(cloudflareHeaders).forEach(([key, value]) => {
    newResponse.headers.set(key, value);
  });
  
  // ULTRA-STRICT CSP that explicitly blocks cloudflareinsights.com
  const ultraStrictCSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' blob:", // ONLY our app scripts
    "script-src-elem 'self' 'unsafe-eval' blob:", // Explicitly set script-src-elem
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://cdn.discordapp.com",
    "connect-src 'self' https://discord.com https://ps.pishock.com https://auth.pishock.com",
    "font-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
    "block-all-mixed-content"
  ].join('; ');
  
  newResponse.headers.set('Content-Security-Policy', ultraStrictCSP);
  
  // Additional security to prevent any external resource loading
  newResponse.headers.set('X-Content-Type-Options', 'nosniff');
  newResponse.headers.set('X-Frame-Options', 'DENY');
  newResponse.headers.set('X-XSS-Protection', '1; mode=block');
  newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Force no caching to ensure headers are always applied
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    newResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    newResponse.headers.set('Pragma', 'no-cache');
    newResponse.headers.set('Expires', '0');
  }
  
  return newResponse;
}