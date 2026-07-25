export type CancelState = { cancelled: boolean };

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  factor?: number;
}

// Retries fn with exponential backoff (default: ~0s/3s/6s/12s/24s/48s, ~90s
// total span — long enough to ride out a Render free-tier cold start).
// Stops early if cancelState.cancelled becomes true between attempts.
export async function withRetry<T>(
  fn: () => Promise<T>,
  cancelState: CancelState,
  { retries = 5, baseDelayMs = 3000, factor = 2 }: RetryOptions = {},
): Promise<T> {
  let attempt = 0;
  let delay = baseDelayMs;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries || cancelState.cancelled) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (cancelState.cancelled) throw err;
      delay *= factor;
    }
  }
}
