// Middleware to completely disable Cloudflare script injection
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
  
  // AGGRESSIVELY disable ALL Cloudflare features that inject scripts
  newResponse.headers.set('CF-Analytics', 'off');
  newResponse.headers.set('CF-Web-Analytics', 'off');
  newResponse.headers.set('CF-Browser-Insights', 'off');
  newResponse.headers.set('CF-Cache-Status', 'BYPASS');
  newResponse.headers.set('CF-Polish', 'off');
  newResponse.headers.set('CF-Mirage', 'off');
  newResponse.headers.set('CF-Rocket-Loader', 'off');
  newResponse.headers.set('CF-Auto-Minify', 'off');
  newResponse.headers.set('CF-ScrapeShield', 'off');
  
  // Set CSP that completely blocks external script sources
  const strictCSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' blob:", // Only allow self, unsafe-eval for Vite, and blob for workers
    "style-src 'self' 'unsafe-inline'", // Allow inline styles for Tailwind
    "img-src 'self' data: https://cdn.discordapp.com", // Only Discord CDN for avatars
    "connect-src 'self' https://discord.com https://do.pishock.com https://auth.pishock.com https://ps.pishock.com", // API endpoints
    "font-src 'self'",
    "frame-src 'none'", // Block all frames
    "object-src 'none'", // Block all objects
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join('; ');
  
  newResponse.headers.set('Content-Security-Policy', strictCSP);
  
  // Additional security headers
  newResponse.headers.set('X-Content-Type-Options', 'nosniff');
  newResponse.headers.set('X-Frame-Options', 'DENY');
  newResponse.headers.set('X-XSS-Protection', '1; mode=block');
  newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Prevent caching of HTML to avoid CSP issues
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    newResponse.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    newResponse.headers.set('Pragma', 'no-cache');
    newResponse.headers.set('Expires', '0');
  }
  
  return newResponse;
}