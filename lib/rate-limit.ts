/**
 * A sliding-window rate limiter held in this process's memory.
 *
 * IN-MEMORY IS A REAL LIMITATION, not just an implementation detail: the
 * counters live in one Node process, so they are lost on restart and are NOT
 * shared between instances. Behind two replicas an attacker gets the limit
 * twice over, and behind ten, ten times. That is acceptable for a single
 * server and is why this module keeps the same shape a shared store would —
 * `consume`, `reset` — so moving the counters to Redis is a change of backing
 * store rather than a change to the login route.
 *
 * A sliding window rather than a fixed one: with fixed windows an attacker can
 * spend the whole allowance at the end of one window and again at the start of
 * the next, getting double the attempts across the boundary.
 */

interface Window {
  /** Timestamps of the attempts still inside the window, oldest first. */
  hits: number[];
}

interface Limiter {
  windows: Map<string, Window>;
}

/**
 * `next dev` re-evaluates modules on hot reload, which would drop the counters
 * and hand an attacker a fresh allowance on every code change.
 */
const globalForLimiter = globalThis as unknown as { rateLimiter?: Limiter };

const limiter: Limiter = (globalForLimiter.rateLimiter ??= {
  windows: new Map(),
});

/**
 * Ceiling on tracked keys. Without it, an attacker could exhaust memory by
 * failing once each against an endless stream of made-up addresses. When the
 * cap is hit the least recently active keys are dropped — they are the ones
 * closest to expiring anyway.
 */
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  /** True when this attempt is over the limit and must be refused. */
  limited: boolean;
  /** Attempts still available in the current window. */
  remaining: number;
  /** Seconds until the caller may try again; 0 when they are not limited. */
  retryAfterSeconds: number;
}

function prune(window: Window, windowMs: number, now: number): void {
  const cutoff = now - windowMs;
  while (window.hits.length > 0 && window.hits[0] <= cutoff) {
    window.hits.shift();
  }
}

function evictIfCrowded(): void {
  if (limiter.windows.size <= MAX_TRACKED_KEYS) return;

  // Map preserves insertion order, and a key is re-inserted on every hit
  // below, so the front of the iteration order is the least recently active.
  const excess = limiter.windows.size - MAX_TRACKED_KEYS;
  let dropped = 0;
  for (const key of limiter.windows.keys()) {
    limiter.windows.delete(key);
    if (++dropped >= excess) break;
  }
}

/**
 * Records one attempt against `key` and reports whether it is over the limit.
 *
 * Call this for every *failed* attempt. The attempt that crosses the threshold
 * is itself refused, so `limit: 5` allows five failures and blocks the sixth.
 */
export function consume(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = limiter.windows.get(key);
  const window: Window = existing ?? { hits: [] };

  prune(window, windowMs, now);

  // Re-insert so the key moves to the back of the eviction order.
  limiter.windows.delete(key);
  limiter.windows.set(key, window);
  evictIfCrowded();

  if (window.hits.length >= limit) {
    const oldest = window.hits[0];
    return {
      limited: true,
      remaining: 0,
      // When the oldest hit falls out of the window, one attempt frees up.
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  window.hits.push(now);

  return {
    limited: false,
    remaining: Math.max(0, limit - window.hits.length),
    retryAfterSeconds: 0,
  };
}

/**
 * Reports the current state without recording an attempt. Used to refuse a
 * caller who is already over the limit before doing any expensive work.
 */
export function peek(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const window = limiter.windows.get(key);
  if (!window) return { limited: false, remaining: limit, retryAfterSeconds: 0 };

  const now = Date.now();
  prune(window, windowMs, now);

  if (window.hits.length >= limit) {
    const oldest = window.hits[0];
    return {
      limited: true,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  return {
    limited: false,
    remaining: limit - window.hits.length,
    retryAfterSeconds: 0,
  };
}

/** Forgets a key's history — called when a sign-in finally succeeds. */
export function reset(key: string): void {
  limiter.windows.delete(key);
}

/** Test seam: drops every counter. */
export function resetAll(): void {
  limiter.windows.clear();
}
