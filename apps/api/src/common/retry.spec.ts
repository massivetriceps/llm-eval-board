import { backoffDelay, RetryFailure, withRetry } from './retry';

const fast = { maxAttempts: 4, baseDelayMs: 1, maxDelayMs: 2 };

describe('withRetry', () => {
  it('첫 시도에 성공하면 attempts 는 1이다', async () => {
    const result = await withRetry(() => Promise.resolve('ok'), fast, () => true);

    expect(result).toEqual({ value: 'ok', attempts: 1 });
  });

  it('실패 후 재시도해서 성공한다', async () => {
    let calls = 0;
    const result = await withRetry(
      () => {
        calls++;
        return calls < 3
          ? Promise.reject(new Error('503'))
          : Promise.resolve('ok');
      },
      fast,
      () => true,
    );

    expect(result).toEqual({ value: 'ok', attempts: 3 });
  });

  it('재시도할 수 없는 에러는 바로 포기한다', async () => {
    let calls = 0;
    const promise = withRetry(
      () => {
        calls++;
        return Promise.reject(new Error('401'));
      },
      fast,
      () => false,
    );

    await expect(promise).rejects.toMatchObject({ attempts: 1 });
    expect(calls).toBe(1);
  });

  it('최대 횟수를 넘으면 RetryFailure 로 끝난다', async () => {
    let calls = 0;
    const promise = withRetry(
      () => {
        calls++;
        return Promise.reject(new Error('503'));
      },
      fast,
      () => true,
    );

    await expect(promise).rejects.toBeInstanceOf(RetryFailure);
    expect(calls).toBe(4);
  });
});

describe('backoffDelay', () => {
  const options = { baseDelayMs: 1000, maxDelayMs: 8000 };

  it('시도마다 2배씩 늘어난다', () => {
    expect(backoffDelay(1, options, () => 1)).toBe(1000);
    expect(backoffDelay(2, options, () => 1)).toBe(2000);
    expect(backoffDelay(3, options, () => 1)).toBe(4000);
  });

  it('최대 대기 시간을 넘지 않는다', () => {
    expect(backoffDelay(10, options, () => 1)).toBe(8000);
  });

  it('지터를 적용해도 계산값의 절반 아래로 내려가지 않는다', () => {
    expect(backoffDelay(3, options, () => 0)).toBe(2000);
  });
});
