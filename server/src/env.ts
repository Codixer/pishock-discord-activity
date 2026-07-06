export interface AppEnv {
  DATABASE_URL: string;
  ENCRYPTION_KEY: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_BOT_TOKEN: string;
  OWNER_ADMIN_USER_IDS?: string;
  NODE_ENV: string;
  PORT: string;
  API_PORT: string;
}

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadEnv(): AppEnv {
  return {
    DATABASE_URL: requireEnv('DATABASE_URL', 'postgresql://pishock:pishock@localhost:5432/pishock'),
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'dev-only-key-change-in-production-32bytes!!',
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || '',
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || '',
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || '',
    OWNER_ADMIN_USER_IDS: process.env.OWNER_ADMIN_USER_IDS,
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: process.env.PORT || '3000',
    API_PORT: process.env.API_PORT || '3001',
  };
}
