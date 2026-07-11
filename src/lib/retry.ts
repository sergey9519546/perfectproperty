/**
 * Exponential backoff retry helper for flaky external APIs.
 * Retries on network errors, 429, and 5xx. Message must include the status
 * code (adapters throw `Error("Realie 429: ...")` etc.) for detection.
 */
export interface RetryOptions {
  retries?: number;
  baseMs?: number;
  maxMs?: number;
  onRetry?: (attempt: number, err: unknown) => void;
}

const RETRYABLE = /\b(429|500|502|503|504|ETIMEDOUT|ECONNRESET|ENETUNREACH|fetch failed|network|timeout)\b/i;

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 4;
  const base = opts.baseMs ?? 400;
  const max = opts.maxMs ?? 8000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      const retryable = RETRYABLE.test(msg);
      if (!retryable || attempt === retries) throw e;
      const jitter = Math.random() * base;
      const delay = Math.min(max, base * 2 ** attempt + jitter);
      opts.onRetry?.(attempt + 1, e);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
