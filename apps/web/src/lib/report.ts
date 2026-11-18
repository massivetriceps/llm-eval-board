import type { CompareCell, CompareResponse, CompareRun, RunMetrics } from '../api/types.ts'
import { formatMs, formatNumber, formatPercent, formatUsd } from './format.ts'
import { OVERLAP_NOTICE, formatInterval, intervalsOverlap } from './stats.ts'

// 비교 결과를 CSV / Markdown 문자열로 바꾼다. 화면에 이미 받아 둔 데이터로 만들기 때문에
// 서버를 다시 부르지 않고, 화면에 보이는 숫자와 항상 같다.

const CSV_BOM = '﻿' // 엑셀이 UTF-8 한글을 깨뜨리지 않게 한다

// 엑셀에서 열 때 =, +, -, @ 로 시작하는 셀이 수식으로 실행되지 않게 막는다 (CSV injection)
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function cellScore(cell: CompareCell | undefined): string {
  if (!cell) return ''
  if (cell.status === 'FAILED') return 'FAILED'
  return cell.score === null ? '' : String(Math.round(cell.score * 1000) / 1000)
}

export function buildCsv(data: CompareResponse, labels: Map<string, string>): string {
  const header = ['position', 'input', 'expected']
  for (const run of data.runs) {
    const label = labels.get(run.id) ?? run.id
    header.push(`${label} | score`, `${label} | output`)
  }
  const lines = [header.map(csvCell).join(',')]
  for (const item of data.items) {
    const row: (string | number | null)[] = [item.position + 1, item.input, item.expected]
    for (const run of data.runs) {
      const cell = item.cells[run.id]
      row.push(cellScore(cell), cell?.output ?? '')
    }
    lines.push(row.map(csvCell).join(','))
  }
  return CSV_BOM + lines.join('\r\n') + '\r\n'
}

// Markdown 표 셀 안에서 표가 깨지지 않게 한다
function mdCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
}

interface MetricLine {
  label: string
  value: (metrics: RunMetrics) => string
}

const METRIC_LINES: MetricLine[] = [
  { label: '정답률 (전체 기준, 실패=0점)', value: (m) => formatPercent(m.overallScore) },
  { label: '정답률 95% 신뢰구간', value: (m) => formatInterval(m.overallScoreCi) },
  { label: '평균 점수 (응답 성공분만)', value: (m) => formatPercent(m.avgScore) },
  { label: '성공률', value: (m) => formatPercent(m.successRate) },
  { label: '검색 적중률', value: (m) => formatPercent(m.hitRate) },
  { label: '총 비용', value: (m) => formatUsd(m.costUsd) },
  { label: '평균 지연', value: (m) => formatMs(m.avgLatencyMs) },
  { label: 'p95 지연', value: (m) => formatMs(m.p95LatencyMs) },
  { label: '평균 시도 횟수', value: (m) => m.avgAttempts.toFixed(2) },
  { label: '토큰 (입력+출력)', value: (m) => formatNumber(m.inputTokens + m.outputTokens) },
]

function runDescription(run: CompareRun, label: string): string {
  const parts = [
    `${run.modelConfig.provider}/${run.modelConfig.model}`,
    `프롬프트 ${run.prompt.name} v${run.prompt.version}`,
    `채점 ${run.scorer}`,
  ]
  if (run.usesDocument) parts.push(`RAG(top-${run.topK})`)
  return `- **${mdCell(label)}**: ${parts.map(mdCell).join(', ')}`
}

function mdScore(cell: CompareCell | undefined): string {
  if (!cell) return '-'
  if (cell.status === 'FAILED') return '실패'
  return cell.score === null ? '응답' : formatPercent(cell.score)
}

export function buildMarkdown(data: CompareResponse, labels: Map<string, string>, generatedAt = new Date()): string {
  const name = (run: CompareRun) => mdCell(labels.get(run.id) ?? run.id)
  const out: string[] = []

  out.push('# LLM 평가 비교 리포트', '')
  out.push(`- 데이터셋: ${mdCell(data.runs[0]?.dataset.name ?? '-')} (질문 ${data.items.length}개)`)
  out.push(`- 생성 시각: ${generatedAt.toISOString()}`, '')

  out.push('## 실행 구성', '')
  for (const run of data.runs) out.push(runDescription(run, labels.get(run.id) ?? run.id))
  out.push('')

  out.push('## 지표 요약', '')
  out.push(`| 지표 | ${data.runs.map(name).join(' | ')} |`)
  out.push(`| --- | ${data.runs.map(() => '---').join(' | ')} |`)
  for (const line of METRIC_LINES) {
    const values = data.runs.map((run) => line.value(run.metrics))
    if (values.every((value) => value === '-')) continue
    out.push(`| ${line.label} | ${values.join(' | ')} |`)
  }
  out.push('')

  out.push('## 질문별 점수', '')
  out.push(`| # | 질문 | ${data.runs.map(name).join(' | ')} |`)
  out.push(`| --- | --- | ${data.runs.map(() => '---').join(' | ')} |`)
  for (const item of data.items) {
    const question = mdCell(item.input.length > 60 ? `${item.input.slice(0, 60)}…` : item.input)
    out.push(`| ${item.position + 1} | ${question} | ${data.runs.map((run) => mdScore(item.cells[run.id])).join(' | ')} |`)
  }
  out.push('')

  if (intervalsOverlap(data.runs) === true) {
    out.push(`> ${OVERLAP_NOTICE}`, '')
  }
  if (data.items.length < 30) {
    out.push(
      `> 주의: 질문이 ${data.items.length}개뿐이라 작은 점수 차이는 우연일 수 있습니다. 결론을 내리기 전에 질문 수를 늘려 다시 확인하세요.`,
      '',
    )
  }
  if (data.runs.some((run) => run.scorer === 'judge')) {
    out.push('> LLM 심사(judge) 점수는 심사 모델의 편향(자기 모델 선호 등)이 섞일 수 있습니다.', '')
  }
  return out.join('\n')
}

// 브라우저 다운로드를 시작한다. 서버를 거치지 않으므로 인증 헤더 문제가 없다
export function downloadText(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
