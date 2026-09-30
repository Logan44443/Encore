import type { Context } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { env } from "../env";

/**
 * Fixed-window, in-process rate limiter. Like the other in-memory caches it
 * assumes a single API instance; move the counters to Redis before scaling out.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private limit: number,
    private windowMs: number,
    private maxKeys = 50_000,
  ) {}

  /** Counts one hit for `key`; returns seconds to wait when over the limit, else 0. */
  hit(key: string, now = Date.now()): number {
    let slot = this.hits.get(key);
    if (!slot || slot.resetAt <= now) {
      if (this.hits.size >= this.maxKeys) this.sweep(now);
      slot = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, slot);
    }
    slot.count++;
    return slot.count > this.limit ? Math.ceil((slot.resetAt - now) / 1000) : 0;
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private sweep(now: number) {
    for (const [key, slot] of this.hits) if (slot.resetAt <= now) this.hits.delete(key);
    // Still full of live windows: drop the oldest rather than grow without bound.
    while (this.hits.size >= this.maxKeys) this.hits.delete(this.hits.keys().next().value!);
  }
}

/**
 * The caller's IP. X-Forwarded-For is only trusted when TRUST_PROXY is set,
 * otherwise anyone could dodge limits by sending a fake header.
 */
export function clientIp(c: Context): string {
  if (env.trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function tooMany(retryAfter: number): never {
  throw new HTTPException(429, {
    message: "Too many attempts. Please wait a moment and try again.",
    res: new Response(JSON.stringify({ error: "Too many attempts. Please wait a moment and try again." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) },
    }),
  });
}

/** Per-IP limit for a route group. */
export function rateLimit(limit: number, windowMs: number, name: string) {
  const limiter = new RateLimiter(limit, windowMs);
  return createMiddleware(async (c, next) => {
    const wait = limiter.hit(`${name}:${clientIp(c)}`);
    if (wait > 0) tooMany(wait);
    await next();
  });
}
