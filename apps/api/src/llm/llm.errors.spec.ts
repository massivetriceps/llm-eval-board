import {
  LlmCallError,
  isDailyQuotaExceeded,
  parseRetryAfterMs,
  toLlmCallError,
} from './llm.errors';

const GEMINI_429 =
  '{"error":{"code":429,"message":"You exceeded your current quota. Please retry in 29.499258438s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"29s"}]}}';

const GEMINI_DAILY_429 =
  '{"error":{"code":429,"message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash, description: Generate content requests per day limit exceeded on Free Tier.\\nPlease retry in 21h35m21.29s.","status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"77721s"}]}}';

describe('llm errors', () => {
  it('stops the run instead of retrying when the daily quota is gone', () => {
    expect(isDailyQuotaExceeded(GEMINI_DAILY_429)).toBe(true);
    expect(isDailyQuotaExceeded(GEMINI_429)).toBe(false);
    const error = toLlmCallError(new Error(GEMINI_DAILY_429));
    expect(error.retryable).toBe(false);
    expect(error.fatal).toBe(true);
    expect(error.message).toContain('일일 호출 한도');
    expect(error.message).toContain('gemini-3.8-flash');
    expect(error.message).toContain('22시간');
  });

  it('reads the retry delay from a Gemini 429 body', () => {
    expect(parseRetryAfterMs(GEMINI_429)).toBe(29_000);
  });

  it('falls back to the "retry in" sentence', () => {
    expect(parseRetryAfterMs('Please retry in 29.4s.')).toBe(29_400);
    expect(parseRetryAfterMs('something else')).toBeUndefined();
  });

  it('marks 429 as retryable and carries the delay', () => {
    const error = toLlmCallError(new Error(GEMINI_429));
    expect(error).toBeInstanceOf(LlmCallError);
    expect(error.retryable).toBe(true);
    expect(error.fatal).toBe(false);
    expect(error.retryAfterMs).toBe(29_000);
  });

  it('does not attach a delay to other statuses', () => {
    const error = toLlmCallError(
      new Error('{"error":{"code":503,"message":"high demand. retry in 5s"}}'),
    );
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBeUndefined();
  });
});
