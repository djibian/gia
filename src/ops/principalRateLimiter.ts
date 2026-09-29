export interface PrincipalRateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface PrincipalWindow {
  count: number;
  resetAt: number;
}

/**
 * Small in-process fixed-window limiter for the MCP HTTP boundary.
 *
 * Principal identifiers are used only as private map keys. They are never
 * emitted by this class. Entries are swept after their window expires so the
 * limiter does not retain inactive principals indefinitely.
 */
export class PrincipalRateLimiter {
  private readonly windows = new Map<string, PrincipalWindow>();
  private nextSweepAt = 0;

  constructor(
    private readonly maxRequestsPerMinute: number,
    private readonly now: () => number = Date.now
  ) {
    if (!Number.isInteger(maxRequestsPerMinute) || maxRequestsPerMinute < 1) {
      throw new Error("maxRequestsPerMinute must be a positive integer.");
    }
  }

  consume(principalId: string): PrincipalRateLimitDecision {
    const now = this.now();
    this.sweepExpired(now);

    const existing = this.windows.get(principalId);
    const window =
      existing && existing.resetAt > now
        ? existing
        : { count: 0, resetAt: now + 60_000 };

    if (window.count >= this.maxRequestsPerMinute) {
      this.windows.set(principalId, window);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000))
      };
    }

    window.count += 1;
    this.windows.set(principalId, window);
    return {
      allowed: true,
      remaining: this.maxRequestsPerMinute - window.count,
      retryAfterSeconds: 0
    };
  }

  private sweepExpired(now: number): void {
    if (now < this.nextSweepAt) return;
    for (const [principalId, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(principalId);
    }
    this.nextSweepAt = now + 60_000;
  }
}
