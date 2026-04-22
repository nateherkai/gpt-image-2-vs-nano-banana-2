// Fair (FIFO) token-bucket rate limiter.
// `acquire()` resolves when a token has been consumed.

export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;
  private waiters: Array<() => void> = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
    this.lastRefillMs = Date.now();
  }

  acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.waiters.push(resolve);
      this.tryServe();
    });
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillMs) / 1000;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsedSec * this.refillPerSecond,
    );
    this.lastRefillMs = now;
  }

  private tryServe(): void {
    this.refill();
    while (this.waiters.length > 0 && this.tokens >= 1) {
      this.tokens -= 1;
      const w = this.waiters.shift()!;
      w();
    }
    if (this.waiters.length === 0) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      return;
    }
    if (this.timer) return; // already scheduled
    const needed = 1 - this.tokens;
    const waitMs = Math.max(10, (needed / this.refillPerSecond) * 1000);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.tryServe();
    }, waitMs);
  }
}
