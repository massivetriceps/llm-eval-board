import { Semaphore } from './semaphore';

describe('Semaphore', () => {
  it('동시에 실행되는 작업이 limit 을 넘지 않는다', async () => {
    const semaphore = new Semaphore(2);
    let running = 0;
    let peak = 0;
    const task = () =>
      semaphore.run(async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
      });

    await Promise.all(Array.from({ length: 6 }, () => task()));

    expect(peak).toBe(2);
  });

  it('작업이 실패해도 자리를 반납한다', async () => {
    const semaphore = new Semaphore(1);

    await expect(
      semaphore.run(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    await expect(semaphore.run(() => Promise.resolve(1))).resolves.toBe(1);
  });
});
