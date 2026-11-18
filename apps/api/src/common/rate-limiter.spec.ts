import { IntervalLimiter, intervalForRpm } from './rate-limiter';

describe('IntervalLimiter', () => {
  // 가짜 sleep 은 대기 시간을 기록만 하고 시계는 건드리지 않는다.
  // 시계는 테스트에서 advance 로만 움직인다
  function setup(intervalMs: number) {
    let time = 0;
    const waits: number[] = [];
    const limiter = new IntervalLimiter(
      intervalMs,
      () => time,
      (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    );
    return { limiter, waits, advance: (ms: number) => (time += ms) };
  }

  it('lets the first call through and spaces the next ones', async () => {
    const { limiter, waits } = setup(100);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(waits).toEqual([100, 200]);
  });

  it('reserves distinct slots for simultaneous callers', async () => {
    const { limiter, waits } = setup(100);
    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);
    expect(waits).toEqual([100, 200]);
  });

  it('does not wait when enough time has passed', async () => {
    const { limiter, waits, advance } = setup(100);
    await limiter.acquire();
    advance(500);
    await limiter.acquire();
    expect(waits).toEqual([]);
  });

  it('waits only for the remaining part of the interval', async () => {
    const { limiter, waits, advance } = setup(100);
    await limiter.acquire();
    advance(30);
    await limiter.acquire();
    expect(waits).toEqual([70]);
  });

  it('adds a safety margin to the per-minute interval', () => {
    expect(intervalForRpm(5)).toBe(13_200);
    expect(intervalForRpm(60)).toBe(1_100);
  });
});
