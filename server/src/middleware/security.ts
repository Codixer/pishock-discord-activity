import type { MiddlewareHandler } from 'hono';

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  const path = new URL(c.req.url).pathname;
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' blob:",
    "script-src-elem 'self' 'unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://cdn.discordapp.com",
    "connect-src 'self' https://discord.com https://api.pishock.com https://relay.pishock.com wss:",
    "font-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
    "block-all-mixed-content",
  ].join('; ');

  c.header('Content-Security-Policy', csp);
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (path === '/' || path.endsWith('.html')) {
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
  }
};
