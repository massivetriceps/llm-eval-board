import { envNumber } from '../common/env';
import type { RetryOptions } from '../common/retry';
import { LlmCallError } from './llm.errors';

// 생성 호출과 심판 호출이 같은 재시도 규칙을 쓰도록 한곳에 둔다
export function llmRetryOptions(): RetryOptions {
  return {
    maxAttempts: envNumber('LLM_MAX_ATTEMPTS', 4),
    baseDelayMs: envNumber('LLM_RETRY_BASE_MS', 1000),
    maxDelayMs: envNumber('LLM_RETRY_MAX_MS', 15_000),
    retryAfterMs: (error) =>
      error instanceof LlmCallError ? error.retryAfterMs : undefined,
    maxRetryAfterMs: envNumber('LLM_RETRY_AFTER_MAX_MS', 120_000),
  };
}
