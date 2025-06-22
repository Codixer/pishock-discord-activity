// Middleware to COMPLETELY prevent any Cloudflare script injection
export async function onRequest(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  
  // Get the response first
  const response = await context.next();
  
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