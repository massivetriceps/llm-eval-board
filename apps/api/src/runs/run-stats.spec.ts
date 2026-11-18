import { percentile, summarizeResults, type ResultRow } from './run-stats';

function row(overrides: Partial<ResultRow> = {}): ResultRow {
  return {
    status: 'SUCCEEDED',
    score: null,
    hit: null,
    latencyMs: 100,
    costUsd: 0,
    judgeCostUsd: 0,
    inputTokens: 10,
    outputTokens: 20,
    attempts: 1,
    ...overrides,
  };
}

describe('percentile', () => {
  it('가까운 순위 방식으로 계산한다', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 95)).toBe(100);
    expect(percentile(values, 10)).toBe(10);
  });

  it('입력 순서와 상관없고 원본을 바꾸지 않는다', () => {
    const values = [30, 10, 20];
    expect(percentile(values, 50)).toBe(20);
    expect(values).toEqual([30, 10, 20]);
  });

  it('값이 없으면 0 이다', () => {
    expect(percentile([], 95)).toBe(0);
  });
});

describe('summarizeResults', () => {
  it('성공률과 평균 점수를 계산한다', () => {
    const metrics = summarizeResults([
      row({ score: 1 }),
      row({ score: 0 }),
      row({ status: 'FAILED', latencyMs: 0, attempts: 4 }),
    ]);
    expect(metrics.total).toBe(3);
    expect(metrics.succeeded).toBe(2);
    expect(metrics.failed).toBe(1);
    expect(metrics.successRate).toBeCloseTo(2 / 3);
    // 채점되지 않은 실패 행은 평균에서 빠진다
    expect(metrics.avgScore).toBe(0.5);
    expect(metrics.scoredCount).toBe(2);
    expect(metrics.avgAttempts).toBe(2);
  });

  it('지연시간은 실패한 행을 빼고 계산한다', () => {
    const metrics = summarizeResults([
      row({ latencyMs: 100 }),
      row({ latencyMs: 300 }),
      row({ status: 'FAILED', latencyMs: 0 }),
    ]);
    expect(metrics.avgLatencyMs).toBe(200);
    expect(metrics.p95LatencyMs).toBe(300);
  });

  it('비용은 생성 비용과 심판 비용을 더한다', () => {
    const metrics = summarizeResults([
      row({ costUsd: 0.5, judgeCostUsd: 0.25 }),
      row({ costUsd: 0.25, judgeCostUsd: 0 }),
    ]);
    expect(metrics.costUsd).toBe(1);
    expect(metrics.judgeCostUsd).toBe(0.25);
  });

  it('채점·검색 결과가 없으면 avgScore 와 hitRate 는 null 이다', () => {
    const metrics = summarizeResults([row(), row()]);
    expect(metrics.avgScore).toBeNull();
    expect(metrics.hitRate).toBeNull();
  });

  it('hitRate 는 근거가 있는 질문 중 적중한 비율이다', () => {
    const metrics = summarizeResults([
      row({ hit: true }),
      row({ hit: false }),
      row({ hit: null }),
    ]);
    expect(metrics.hitRate).toBe(0.5);
  });

  it('행이 없어도 오류 없이 0 으로 채운다', () => {
    const metrics = summarizeResults([]);
    expect(metrics.total).toBe(0);
    expect(metrics.successRate).toBe(0);
    expect(metrics.avgLatencyMs).toBe(0);
  });
});
