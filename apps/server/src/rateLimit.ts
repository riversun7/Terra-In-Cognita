// 토큰 버킷 속도 제한 — 키(접속 주소 등)마다 capacity개까지 모아 두고, 분당 refillPerMinute개씩 다시 채운다.
// 메모리에만 둔다(서버를 다시 켜면 처음부터). 키가 너무 많아지면 가득 찬(한동안 안 쓴) 버킷부터 지운다.

export interface RateLimiterOptions {
  capacity: number;
  refillPerMinute: number;
  now?: () => number;
  /** 기억할 키 수 상한 (넘으면 정리) */
  maxKeys?: number;
}

export interface RateLimiter {
  /** 1개를 쓴다. 남은 것이 없으면 false */
  take(key: string): boolean;
  /** 다음 1개가 찰 때까지 남은 시간(ms). 지금 쓸 수 있으면 0 (Retry-After 안내용, 쓰지 않는다) */
  retryAfterMs(key: string): number;
  /** 기억하고 있는 키 수 (시험용) */
  size(): number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? 10_000;
  const perMs = options.refillPerMinute / 60_000;
  const buckets = new Map<string, { tokens: number; updatedAt: number }>();

  const refilled = (bucket: { tokens: number; updatedAt: number }, at: number): number =>
    Math.min(options.capacity, bucket.tokens + (at - bucket.updatedAt) * perMs);

  const prune = (at: number): void => {
    for (const [key, bucket] of buckets) {
      if (refilled(bucket, at) >= options.capacity) buckets.delete(key);
    }
    // 그래도 가득하면(주소가 아주 많은 공격) 모두 잊는다. 전체 상한은 따로 두는 제한기가 지킨다.
    if (buckets.size >= maxKeys) buckets.clear();
  };

  return {
    take(key) {
      const at = now();
      let bucket = buckets.get(key);
      if (bucket) {
        bucket.tokens = refilled(bucket, at);
        bucket.updatedAt = at;
      } else {
        if (buckets.size >= maxKeys) prune(at);
        bucket = { tokens: options.capacity, updatedAt: at };
        buckets.set(key, bucket);
      }
      if (bucket.tokens < 1) return false;
      bucket.tokens -= 1;
      return true;
    },
    retryAfterMs(key) {
      const bucket = buckets.get(key);
      if (!bucket) return 0;
      const tokens = refilled(bucket, now());
      return tokens >= 1 ? 0 : Math.ceil((1 - tokens) / perMs);
    },
    size: () => buckets.size,
  };
}
