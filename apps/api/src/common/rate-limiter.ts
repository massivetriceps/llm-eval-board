// 호출을 일정한 간격으로 띄워서 시작시킨다. (예: 분당 5회 제한 → 13.2초 간격)
// 슬롯을 동기적으로 예약하므로 동시에 여러 호출이 와도 순서대로 자기 차례를 받는다.
export class IntervalLimiter {
  private nextSlot = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async acquire(): Promise<void> {
    const current = this.now();
    const slot = Math.max(current, this.nextSlot);
    this.nextSlot = slot + this.intervalMs;
    const waitMs = slot - current;
    if (waitMs > 0) await this.sleep(waitMs);
  }
}

// 분당 호출 수(rpm)에서 간격을 계산한다. 제공자가 구간을 어떻게 세든 넘지 않도록 10% 여유를 둔다
export function intervalForRpm(rpm: number): number {
  // 소수 곱셈은 부동소수점 오차가 생기므로 정수로 계산한다 (60000 * 1.1 / rpm)
  return Math.ceil(66_000 / rpm);
}
