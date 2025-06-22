// Middleware to disable Cloudflare features that inject scripts
export async function onRequest(context: any) {
  const response = await context.next();
  
  // Disable Cloudflare Analytics and other script injection
  response.headers.set('CF-Analytics', 'off');
  response.headers.set('CF-Cache-Status', 'BYPASS');
  
  return response;
}