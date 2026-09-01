import { env } from '../env.js';
import {
  CONSUMER_ORIGIN,
  PROVIDER_ORIGIN,
} from '../modules/auth/app-origins.js';

const DEFAULT_ORIGINS = [CONSUMER_ORIGIN, PROVIDER_ORIGIN] as const;

export function parseCorsOrigins(): string[] {
  const configured = env.CORS_ORIGIN ?? DEFAULT_ORIGINS.join(',');
  const origins = configured
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== '*');

  return origins.length > 0 ? origins : [...DEFAULT_ORIGINS];
}
