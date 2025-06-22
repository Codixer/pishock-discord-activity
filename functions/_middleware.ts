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
}

export async function onRequest(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  
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
    "connect-src 'self' https://discord.com https://do.pishock.com https://auth.pishock.com https://ps.pishock.com",
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