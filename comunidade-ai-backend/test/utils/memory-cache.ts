export type MemoryCache = {
  get: <T = any>(key: string) => Promise<T | undefined>;
  set: (key: string, value: any, ttl?: number) => Promise<void>;
};

export function createMemoryCache(): MemoryCache {
  const store = new Map<string, { value: any; expiresAt?: number }>();

  return {
    async get<T = any>(key: string) {
      const item = store.get(key);
      if (!item) return undefined;
      if (typeof item.expiresAt === 'number' && item.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return item.value as T;
    },
    async set(key: string, value: any, ttl?: number) {
      const expiresAt = typeof ttl === 'number' ? Date.now() + ttl : undefined;
      store.set(key, { value, expiresAt });
    },
  };
}

