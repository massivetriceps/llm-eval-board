import { withRetry } from './retry';

describe('withRetry retry-after hint', () => {
  it('waits at least as long as the hint, capped by maxRetryAfterMs', async () => {
    const delays: number[] = [];
    let calls = 0;
    const { attempts } = await withRetry(
      () => {
        calls++;
        return calls < 3 ? Promise.reject(new Error('429')) : Promise.resolve('ok');
      },
      {
        maxAttempts: 4,
        baseDelayMs: 1,
        maxDelayMs: 2,
        retryAfterMs: () => (calls === 1 ? 30 : 1000),
        maxRetryAfterMs: 40,
      },
      () => true,
      (_attempt, delayMs) => delays.push(delayMs),
    );
    expect(attempts).toBe(3);
    // 첫 힌트(30ms)는 그대로, 두 번째 힌트(1000ms)는 상한 40ms 로 잘린다
    expect(delays).toEqual([30, 40]);
  });

  it('keeps plain backoff when there is no hint', async () => {
    const delays: number[] = [];
    let calls = 0;
    await withRetry(
      () => (++calls < 2 ? Promise.reject(new Error('x')) : Promise.resolve(1)),
      { maxAttempts: 3, baseDelayMs: 2, maxDelayMs: 2, retryAfterMs: () => undefined },
      () => true,
      (_a, delayMs) => delays.push(delayMs),
    );
    expect(delays[0]).toBeGreaterThanOrEqual(1);
    expect(delays[0]).toBeLessThanOrEqual(2);
  });
});
