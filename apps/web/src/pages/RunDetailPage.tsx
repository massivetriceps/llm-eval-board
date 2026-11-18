import { Fragment, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { runs } from '../api/endpoints.ts'
import type { RunDetail, RunResultRow } from '../api/types.ts'
import { useWorkspaceId } from '../auth/auth-context.ts'
import { ErrorBox, Loading } from '../components/Feedback.tsx'
import { Kpi } from '../components/Kpi.tsx'
import { ProgressBar } from '../components/ProgressBar.tsx'
import { StatusBadge, isActive } from '../components/StatusBadge.tsx'
import { formatMs, formatNumber, formatPercent, formatUsd } from '../lib/format.ts'
import { buttonDanger, buttonSecondary, card, td, th } from '../lib/ui.ts'
import { useResource } from '../lib/useResource.ts'

type Filter = 'all' | 'failed' | 'wrong'

export function RunDetailPage() {
  const workspaceId = useWorkspaceId()
  const { runId = '' } = useParams()
  const [filter, setFilter] = useState<Filter>('all')
  const [cancelError, setCancelError] = useState<string | null>(null)

  const run = useResource(
    `run:${runId}`,
    () => runs.get(workspaceId, runId),
    (data) => (isActive(data.status) ? 1500 : null),
  )
  const status = run.data?.status
  const active = status ? isActive(status) : false
  // 실행이 끝나면 key 가 바뀌어 최종 결과를 한 번 더 불러온다
  const results = useResource(
    status ? `results:${runId}:${active ? 'active' : status}` : null,
    () => runs.results(workspaceId, runId),
    active ? 3000 : null,
  )

  async function cancel() {
    setCancelError(null)
    try {
      await runs.cancel(workspaceId, runId)
      run.reload()
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : String(e))
    }
  }

  if (run.error && !run.data) return <ErrorBox message={run.error} />
  if (!run.data) return <Loading />
  const data = run.data

  const rows = results.data ?? []
  const shown = rows.filter((row) => {
    if (filter === 'failed') return row.status === 'FAILED'
    if (filter === 'wrong') return row.score !== null && row.score < 1
    return true
  })

  return (
    <div className="space-y-5">
      <div>
        <Link to="/" className="text-sm text-slate-500 hover:underline">
          ← 실행 목록
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">
            {data.modelConfig.label}
            <span className="ml-2 text-base font-normal text-slate-500">
              {data.prompt.name} v{data.prompt.version} · {data.dataset.name}
            </span>
          </h1>
          <StatusBadge status={data.status} />
          {active && (
            <button type="button" className={`${buttonDanger} ml-auto`} onClick={cancel}>
              실행 취소
            </button>
          )}
        </div>
      </div>

      {cancelError && <ErrorBox message={cancelError} />}
      {data.error && <ErrorBox message={`실행이 중단되었습니다: ${data.error}`} />}
      {run.error && <ErrorBox message={run.error} />}

      <div className={`${card} p-4`}>
        <ProgressBar progress={data.progress} />
      </div>

      <Summary run={data} />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">질문별 결과</h2>
          <div className="ml-auto flex gap-1">
            {(
              [
                ['all', '전체'],
                ['wrong', '틀린 것'],
                ['failed', '실패'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`${buttonSecondary} !px-3 !py-1 ${filter === value ? '!border-blue-500 !text-blue-700' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {results.error && <ErrorBox message={results.error} />}
        <ResultsTable rows={shown} showHit={data.summary.hitRate !== null} />
        {rows.length >= 500 && (
          <p className="text-xs text-slate-500">처음 500건만 보여 줍니다.</p>
        )}
      </section>
    </div>
  )
}

function Summary({ run }: { run: RunDetail }) {
  const { summary } = run
  const scoreLabel = run.scorer === 'judge' ? '평균 점수' : run.scorer === 'none' ? '점수' : '정확도'
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi
        label={scoreLabel}
        value={formatPercent(summary.avgScore)}
        hint={summary.scoredCount > 0 ? `${summary.scoredCount}문항 채점` : '채점 안 함'}
      />
      {summary.hitRate !== null && (
        <Kpi label="검색 적중률" value={formatPercent(summary.hitRate)} hint={`상위 ${run.topK}개 문단 기준`} />
      )}
      <Kpi
        label="비용"
        value={formatUsd(summary.costUsd + summary.judgeCostUsd)}
        hint={summary.judgeCostUsd > 0 ? `심판 ${formatUsd(summary.judgeCostUsd)} 포함` : undefined}
      />
      <Kpi label="평균 지연" value={formatMs(summary.avgLatencyMs)} />
      <Kpi
        label="토큰"
        value={formatNumber(summary.inputTokens + summary.outputTokens)}
        hint={`입력 ${formatNumber(summary.inputTokens)} · 출력 ${formatNumber(summary.outputTokens)}`}
      />
    </div>
  )
}

function ResultsTable({ rows, showHit }: { rows: RunResultRow[]; showHit: boolean }) {
  const [open, setOpen] = useState<string | null>(null)
  if (rows.length === 0) {
    return <div className={`${card} px-4 py-8 text-center text-sm text-slate-500`}>표시할 결과가 없습니다.</div>
  }
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full min-w-[720px]">
        <thead className="border-b border-slate-200">
          <tr>
            <th className={th}>#</th>
            <th className={th}>질문</th>
            <th className={th}>상태</th>
            <th className={th}>점수</th>
            {showHit && <th className={th}>검색</th>}
            <th className={th}>시도</th>
            <th className={th}>지연</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <Fragment key={row.id}>
              <tr
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setOpen(open === row.id ? null : row.id)}
              >
                <td className={`${td} text-slate-400`}>{row.position + 1}</td>
                <td className={`${td} max-w-xs truncate`}>{row.item.input}</td>
                <td className={td}>
                  {row.status === 'SUCCEEDED' ? (
                    <span className="text-green-700">성공</span>
                  ) : (
                    <span className="text-red-600">실패</span>
                  )}
                </td>
                <td className={`${td} tabular-nums`}>{scoreChip(row)}</td>
                {showHit && (
                  <td className={td}>{row.hit === null ? '-' : row.hit ? '적중' : <span className="text-red-600">놓침</span>}</td>
                )}
                <td className={`${td} tabular-nums`}>{row.attempts}</td>
                <td className={`${td} tabular-nums`}>{row.status === 'SUCCEEDED' ? formatMs(row.latencyMs) : '-'}</td>
              </tr>
              {open === row.id && (
                <tr className="bg-slate-50">
                  <td colSpan={showHit ? 7 : 6} className="px-4 py-3">
                    <ResultDetail row={row} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function scoreChip(row: RunResultRow) {
  if (row.score === null) return <span className="text-slate-400">{row.scoreError ? '채점 실패' : '-'}</span>
  const color = row.score >= 1 ? 'text-green-700' : row.score <= 0 ? 'text-red-600' : 'text-amber-600'
  return <span className={color}>{formatPercent(row.score)}</span>
}

function ResultDetail({ row }: { row: RunResultRow }) {
  return (
    <dl className="space-y-3 text-sm">
      <Block label="질문" value={row.item.input} />
      {row.item.expected && <Block label="정답" value={row.item.expected} />}
      {row.output !== null && <Block label="응답" value={row.output} />}
      {row.error && <Block label="오류" value={row.error} tone="error" />}
      {row.judgeReason && <Block label="심판 의견" value={row.judgeReason} />}
      {row.scoreError && <Block label="채점 오류" value={row.scoreError} tone="error" />}
      {row.retrieved && row.retrieved.length > 0 && (
        <Block
          label="검색된 문단"
          value={row.retrieved.map((r) => `#${r.position + 1} (점수 ${r.score})`).join(', ')}
        />
      )}
    </dl>
  )
}

function Block({ label, value, tone }: { label: string; value: string; tone?: 'error' }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className={`mt-0.5 whitespace-pre-wrap break-words ${tone === 'error' ? 'text-red-600' : ''}`}>{value}</dd>
    </div>
  )
}
