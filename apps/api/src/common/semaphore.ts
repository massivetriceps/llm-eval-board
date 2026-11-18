// 동시에 실행되는 작업 수를 limit 개로 제한한다 (외부 API 호출 폭주 방지)
export class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(limit: number) {
    if (limit < 1) throw new Error('limit 은 1 이상이어야 합니다.');
    this.available = limit;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      // 대기 중인 작업에게 자리를 바로 넘겨준다
      next();
    } else {
      this.available++;
    }
  }
}
