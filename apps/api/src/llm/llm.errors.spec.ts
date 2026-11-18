import { LlmCallError, parseRetryAfterMs, toLlmCallError } from './llm.errors';

const GEMINI_429 =
  '{"error":{"code":429,"message":"You exceeded your current quota. Please retry in 29.499258438s.","status":"RESOURCE_EXHAUSTED","details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"29s"}]}}';

describe('llm errors', () => {
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
