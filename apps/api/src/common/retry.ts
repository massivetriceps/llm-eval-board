export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  // 오류가 "n ms 뒤에 다시 하라"고 알려 주면 그만큼은 기다린다 (백오프보다 길 때만)
  retryAfterMs?: (error: unknown) => number | undefined;
  // 위 힌트를 따르는 최대 대기 시간. 하루 한도처럼 너무 긴 대기는 따르지 않는다
  maxRetryAfterMs?: number;
}

export class RetryFailure extends Error {
  constructor(
    readonly attempts: number,
    readonly causeError: unknown,
  ) {
    super(
      causeError instanceof Error ? causeError.message : String(causeError),
    );
    this.name = 'RetryFailure';
  }
}

// 지수 백오프 + 지터: 시도마다 대기 시간을 2배로 늘리되(최대 maxDelayMs),
// 절반~전부 사이의 무작위 값을 써서 여러 요청이 동시에 재시도하는 것을 피한다
export function backoffDelay(
  attempt: number,
  options: Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs'>,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(
    options.maxDelayMs,
    options.baseDelayMs * 2 ** (attempt - 1),
  );
  return Math.round(exponential / 2 + (random() * exponential) / 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  task: () => Promise<T>,
  options: RetryOptions,
  shouldRetry: (error: unknown) => boolean,
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void,
): Promise<{ value: T; attempts: number }> {
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      return { value: await task(), attempts: attempt };
    } catch (error) {
      if (attempt >= options.maxAttempts || !shouldRetry(error)) {
        throw new RetryFailure(attempt, error);
      }
      let delayMs = backoffDelay(attempt, options);
      const hint = options.retryAfterMs?.(error);
      if (hint !== undefined) {
        delayMs = Math.max(delayMs, Math.min(hint, options.maxRetryAfterMs ?? 120_000));
      }
      onRetry?.(attempt, delayMs, error);
      await sleep(delayMs);
    }
  }
}
