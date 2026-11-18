import type { CompareRun } from '../api/types.ts'
import { formatPercent } from './format.ts'

// 신뢰구간을 "89.7% ~ 100%" 처럼 보여 준다
export function formatInterval(interval: { low: number; high: number } | null | undefined): string {
  if (!interval) return '-'
  return `${formatPercent(interval.low)} ~ ${formatPercent(interval.high)}`
}

// 모든 실행의 정답률 95% 신뢰구간이 한 점이라도 공통으로 겹치는가.
// 겹치면 지금 표본으로는 실행 간 차이가 우연이 아니라고 말하기 어렵다.
// (구간이 겹쳐도 차이가 없다는 증명은 아니다. 겹치지 않으면 차이가 뚜렷하다는 뜻이다)
export function intervalsOverlap(runs: CompareRun[]): boolean | null {
  const intervals = runs.flatMap((run) => (run.metrics.overallScoreCi ? [run.metrics.overallScoreCi] : []))
  if (intervals.length < 2) return null
  const highestLow = Math.max(...intervals.map((interval) => interval.low))
  const lowestHigh = Math.min(...intervals.map((interval) => interval.high))
  return highestLow <= lowestHigh
}

export const OVERLAP_NOTICE =
  '정답률의 95% 신뢰구간이 겹칩니다. 지금 질문 수로는 실행 간 차이가 우연이 아니라고 말하기 어렵습니다. 질문을 더 늘리거나 더 어려운 질문으로 확인해 보세요.'
