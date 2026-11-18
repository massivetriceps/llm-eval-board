export interface ResultRow {
  status: string;
  score: number | null;
  hit: boolean | null;
  latencyMs: number;
  costUsd: number;
  judgeCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  attempts: number;
}

export interface RunMetrics {
  total: number;
  succeeded: number;
  failed: number;
  // 성공한 질문의 비율 (0~1)
  successRate: number;
  // 채점된 결과의 평균 점수 (0~1). 채점된 결과가 없으면 null
  avgScore: number | null;
  scoredCount: number;
  // 전체 질문 기준 정답률 (0~1). 실패해서 점수가 없는 질문은 0점으로 센다.
  // avgScore 는 성공분만의 평균이라, 성공률이 낮은 실행끼리 비교하면 왜곡된다
  overallScore: number | null;
  // overallScore 의 95% 신뢰구간 (0~1). 질문이 너무 적거나 채점된 결과가 없으면 null
  overallScoreCi: ScoreInterval | null;
  // 근거 글귀가 검색 결과에 들어 있던 비율 (0~1). 근거가 있는 질문이 없으면 null
  hitRate: number | null;
  // 생성 비용 + 채점(심판) 비용
  costUsd: number;
  judgeCostUsd: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  // 질문 하나당 평균 시도 횟수 (1 이면 재시도가 없었다는 뜻)
  avgAttempts: number;
}

export interface ScoreInterval {
  low: number;
  high: number;
}

const Z_95 = 1.96;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// 질문별 점수(0~1, 실패는 0)로 평균 점수의 95% 신뢰구간을 구한다.
// - 값이 전부 0 또는 1 (정답/오답 채점): 비율의 Wilson 구간. 100% 나 0% 근처에서도 구간이 터무니없지 않다
// - 연속 점수 (LLM 심판): 평균의 정규근사 구간
// 질문이 2개 미만이면 의미가 없으므로 null
export function scoreInterval(values: number[]): ScoreInterval | null {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const binary = values.every((value) => value === 0 || value === 1);
  if (binary) {
    const z2 = Z_95 * Z_95;
    const denominator = 1 + z2 / n;
    const center = (mean + z2 / (2 * n)) / denominator;
    const half =
      (Z_95 * Math.sqrt((mean * (1 - mean)) / n + z2 / (4 * n * n))) /
      denominator;
    return { low: clamp01(center - half), high: clamp01(center + half) };
  }
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const half = (Z_95 * Math.sqrt(variance)) / Math.sqrt(n);
  return { low: clamp01(mean - half), high: clamp01(mean + half) };
}

// 가까운 순위(nearest-rank) 백분위수. 값이 없으면 0
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// 전체 기준 정답률. 실패해서 점수가 없는 질문도 분모에 넣는다(0점).
// 채점된 결과가 하나도 없으면(채점 안 함 등) null.
// 비교 화면, 실행 목록, 실행 상세가 모두 이 함수를 써서 같은 실행이 같은 점수로 보이게 한다
export function overallScore(
  scoreSum: number | null,
  scoredCount: number,
  rowCount: number,
): number | null {
  if (scoredCount === 0 || rowCount === 0) return null;
  return (scoreSum ?? 0) / rowCount;
}

export function summarizeResults(rows: ResultRow[]): RunMetrics {
  const succeeded = rows.filter((row) => row.status === 'SUCCEEDED');
  // 지연시간은 실제로 응답을 받은 호출만 센다 (실패한 행은 0 으로 저장되어 있다)
  const latencies = succeeded.map((row) => row.latencyMs);
  const scores = rows.flatMap((row) => (row.score === null ? [] : [row.score]));
  const hits = rows.flatMap((row) => (row.hit === null ? [] : [row.hit]));
  const judgeCostUsd = rows.reduce((sum, row) => sum + row.judgeCostUsd, 0);
  const generationCost = rows.reduce((sum, row) => sum + row.costUsd, 0);

  return {
    total: rows.length,
    succeeded: succeeded.length,
    failed: rows.length - succeeded.length,
    successRate: rows.length > 0 ? succeeded.length / rows.length : 0,
    avgScore: mean(scores),
    scoredCount: scores.length,
    overallScore: overallScore(
      scores.reduce((sum, value) => sum + value, 0),
      scores.length,
      rows.length,
    ),
    overallScoreCi:
      scores.length > 0 ? scoreInterval(rows.map((row) => row.score ?? 0)) : null,
    hitRate: hits.length > 0 ? hits.filter(Boolean).length / hits.length : null,
    costUsd: generationCost + judgeCostUsd,
    judgeCostUsd,
    avgLatencyMs: Math.round(mean(latencies) ?? 0),
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
    outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
    avgAttempts: mean(rows.map((row) => row.attempts)) ?? 0,
  };
}
