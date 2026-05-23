import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

type BruteForceState = {
  count: number;
  firstFailureAt: number;
  blockedUntil?: number;
};

@Injectable()
export class BruteForceService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly config: ConfigService,
  ) {}

  async assertAllowed(key: string) {
    const state = await this.getState(key);
    const now = Date.now();
    if (state?.blockedUntil && state.blockedUntil > now) {
      throw new ForbiddenException('Muitas tentativas. Aguarde alguns minutos.');
    }
  }

  async recordFailure(key: string) {
    const now = Date.now();

    const windowMs = this.config.get<number>('BRUTEFORCE_WINDOW_MS') ?? 15 * 60_000;
    const maxAttempts = this.config.get<number>('BRUTEFORCE_MAX_ATTEMPTS') ?? 10;
    const baseBlockMs = this.config.get<number>('BRUTEFORCE_BASE_BLOCK_MS') ?? 5 * 60_000;
    const maxBlockMs = this.config.get<number>('BRUTEFORCE_MAX_BLOCK_MS') ?? 60 * 60_000;

    const existing = (await this.getState(key)) ?? { count: 0, firstFailureAt: now };
    const withinWindow = now - existing.firstFailureAt <= windowMs;
    const state: BruteForceState = withinWindow ? existing : { count: 0, firstFailureAt: now };

    state.count += 1;

    if (state.count >= maxAttempts) {
      const exponent = Math.max(0, state.count - maxAttempts);
      const blockMs = Math.min(maxBlockMs, baseBlockMs * Math.pow(2, exponent));
      const jitterMs = Math.floor(Math.random() * Math.min(5_000, blockMs / 10));
      state.blockedUntil = now + blockMs + jitterMs;
    }

    const ttlMs = Math.max(windowMs, (state.blockedUntil ?? 0) - now) + 5_000;
    await this.cache.set(key, state, ttlMs);
    return state.count;
  }

  async reset(key: string) {
    await this.cache.del(key);
  }

  private async getState(key: string): Promise<BruteForceState | null> {
    const value = await this.cache.get<BruteForceState | number>(key);
    if (!value) return null;
    if (typeof value === 'number') return { count: value, firstFailureAt: Date.now() };
    if (typeof value === 'object' && typeof (value as any).count === 'number') return value as BruteForceState;
    return null;
  }
}
