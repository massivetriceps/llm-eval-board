import {
  overallScore,
  percentile,
  scoreInterval,
  summarizeResults,
  type ResultRow,
} from './run-stats';

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

describe('scoreInterval', () => {
  const ones = (count: number) => Array<number>(count).fill(1);

  it('30문항 전부 정답이어도 하한은 100% 보다 한참 낮다 (Wilson)', () => {
    const ci = scoreInterval(ones(30));
    expect(ci).not.toBeNull();
    expect(ci?.low).toBeCloseTo(0.8865, 3);
    expect(ci?.high).toBe(1);
  });

  it('전부 오답이면 하한이 0 이고 상한은 0 보다 크다', () => {
    const ci = scoreInterval(Array<number>(30).fill(0));
    expect(ci?.low).toBe(0);
    expect(ci?.high).toBeCloseTo(0.1135, 3);
  });

  it('질문이 많을수록 구간이 좁아진다', () => {
    const narrow = scoreInterval([...ones(150), ...Array<number>(150).fill(0)]);
    const wide = scoreInterval([...ones(15), ...Array<number>(15).fill(0)]);
    expect((narrow?.high ?? 0) - (narrow?.low ?? 0)).toBeLessThan(
      (wide?.high ?? 0) - (wide?.low ?? 0),
    );
  });

  it('연속 점수는 평균 ± 1.96 × 표준오차를 쓰고 0~1 로 자른다', () => {
    const ci = scoreInterval([0.25, 0.5, 0.75, 1, 0.5, 0.75]);
    expect(ci).not.toBeNull();
    expect(ci?.low).toBeGreaterThan(0.3);
    expect(ci?.high).toBeLessThanOrEqual(1);
    expect(ci?.low).toBeLessThan(ci?.high ?? 0);
  });

  it('질문이 2개 미만이면 null 이다', () => {
    expect(scoreInterval([])).toBeNull();
    expect(scoreInterval([1])).toBeNull();
  });
});

describe('overallScore', () => {
  it('실패한 질문까지 분모에 넣는다', () => {
    expect(overallScore(8, 8, 30)).toBeCloseTo(8 / 30);
  });

  it('채점된 결과가 없거나 행이 없으면 null 이다', () => {
    expect(overallScore(null, 0, 30)).toBeNull();
    expect(overallScore(0, 0, 0)).toBeNull();
  });

  it('채점된 결과가 있으면 합이 0 이어도 0 점이다', () => {
    expect(overallScore(0, 3, 3)).toBe(0);
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

  it('overallScore 는 실패한 질문을 0점으로 센다', () => {
    const metrics = summarizeResults([
      row({ score: 1 }),
      row({ score: 1 }),
      row({ status: 'FAILED', latencyMs: 0 }),
      row({ status: 'FAILED', latencyMs: 0 }),
    ]);
    // 성공분만 보면 100% 지만, 전체 4문항 중 2문항만 맞힌 것이다
    expect(metrics.avgScore).toBe(1);
    expect(metrics.overallScore).toBe(0.5);
  });

  it('채점하지 않았으면 overallScore 와 신뢰구간은 null 이다', () => {
    const metrics = summarizeResults([row(), row()]);
    expect(metrics.overallScore).toBeNull();
    expect(metrics.overallScoreCi).toBeNull();
  });

  it('실패한 질문은 0점으로 신뢰구간에 들어간다', () => {
    const rows = [
      ...Array.from({ length: 10 }, () => row({ score: 1 })),
      ...Array.from({ length: 10 }, () => row({ status: 'FAILED', latencyMs: 0 })),
    ];
    const ci = summarizeResults(rows).overallScoreCi;
    // 20문항 중 10문항 정답 → 50% 를 가운데로 하는 구간
    expect(ci?.low).toBeLessThan(0.5);
    expect(ci?.high).toBeGreaterThan(0.5);
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
