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
