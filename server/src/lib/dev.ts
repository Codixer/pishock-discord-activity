import type { AppEnv } from '../env.js';

export function isDevelopment(env: AppEnv): boolean {
  return env.NODE_ENV === 'development';
}
