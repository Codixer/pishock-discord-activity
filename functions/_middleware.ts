// Middleware to handle static assets and disable Cloudflare features
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
  
  // Completely disable Cloudflare Analytics and other injections
  newResponse.headers.set('CF-Analytics', 'off');
  newResponse.headers.set('CF-Cache-Status', 'BYPASS');
  newResponse.headers.set('CF-Web-Analytics', 'off');
  newResponse.headers.set('CF-Browser-Insights', 'off');
  
  // Add strict CSP to prevent any external script loading
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    const nonce = generateNonce();
    newResponse.headers.set('Content-Security-Policy', 
      `default-src 'self'; ` +
      `script-src 'self' 'unsafe-eval' 'nonce-${nonce}' blob:; ` +
      `style-src 'self' 'unsafe-inline'; ` +
      `img-src 'self' data: https://cdn.discordapp.com https://images.pexels.com; ` +
      `connect-src 'self' https://discord.com https://do.pishock.com https://auth.pishock.com https://ps.pishock.com; ` +
      `font-src 'self'; ` +
      `frame-src 'none'; ` +
      `object-src 'none'; ` +
      `base-uri 'self'`
    );
  }
  
  // Prevent any Cloudflare features that might inject scripts
  newResponse.headers.set('X-Robots-Tag', 'noindex, nofollow');
  
  return newResponse;
}

// Generate a cryptographically secure nonce
function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}