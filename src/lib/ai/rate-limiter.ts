import type { RateLimitConfig } from "./types";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequestsPerMinute: 30,
  maxToolCallsPerMinute: 60,
  maxToolCallsPerRequest: 10,
  requestTimeoutMs: 30000,
};

const requestBuckets = new Map<string, RateLimitEntry>();
const toolCallBuckets = new Map<string, RateLimitEntry>();

function cleanupBuckets(buckets: Map<string, RateLimitEntry>) {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(
  userId: string,
  config: Partial<RateLimitConfig> = {}
): { allowed: boolean; retryAfterMs?: number } {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  cleanupBuckets(requestBuckets);

  const key = userId;
  const bucket = requestBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    requestBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return { allowed: true };
  }

  if (bucket.count >= cfg.maxRequestsPerMinute) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count++;
  return { allowed: true };
}

export function checkToolCallRateLimit(
  userId: string,
  config: Partial<RateLimitConfig> = {}
): { allowed: boolean; retryAfterMs?: number } {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  cleanupBuckets(toolCallBuckets);

  const key = userId;
  const bucket = toolCallBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    toolCallBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return { allowed: true };
  }

  if (bucket.count >= cfg.maxToolCallsPerMinute) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count++;
  return { allowed: true };
}

export function getToolCallCount(userId: string): number {
  const bucket = toolCallBuckets.get(userId);
  if (!bucket || Date.now() > bucket.resetAt) return 0;
  return bucket.count;
}
