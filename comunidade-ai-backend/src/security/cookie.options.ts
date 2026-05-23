import { ConfigService } from '@nestjs/config';

export function isSecureCookie(config: ConfigService) {
  return (config.get<string>('APP_ENV') ?? 'local') !== 'local';
}

export function cookieDomain(config: ConfigService) {
  const domain = config.get<string>('COOKIE_DOMAIN') || '';
  return domain ? domain : undefined;
}

export function cookieSameSite(config: ConfigService): 'lax' | 'strict' | 'none' {
  const raw = (config.get<string>('COOKIE_SAMESITE') ?? 'lax').toLowerCase();
  if (raw === 'none') return 'none';
  if (raw === 'strict') return 'strict';
  return 'lax';
}
