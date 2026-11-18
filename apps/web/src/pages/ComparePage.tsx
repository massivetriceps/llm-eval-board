import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { runs } from '../api/endpoints.ts'
import type { CompareCell, CompareItem, CompareResponse, CompareRun, RunMetrics } from '../api/types.ts'
import { useWorkspaceId } from '../auth/auth-context.ts'
import { ErrorBox, Loading } from '../components/Feedback.tsx'
import { StatusBadge, isActive } from '../components/StatusBadge.tsx'
import { formatMs, formatNumber, formatPercent, formatUsd } from '../lib/format.ts'
import { buildCsv, buildMarkdown, downloadText } from '../lib/report.ts'
import { RUN_COLORS, buttonSecondary, card, td, th } from '../lib/ui.ts'
import { useResource } from '../lib/useResource.ts'

interface MetricRow {
  label: string
  // high: 클수록 좋음, low: 작을수록 좋음, null: 좋고 나쁨이 없는 값
  better: 'high' | 'low' | null
  value: (metrics: RunMetrics) => number | null
  format: (value: number) => string
}

const METRIC_ROWS: MetricRow[] = [
  { label: '평균 점수', better: 'high', value: (m) => m.avgScore, format: formatPercent },
  { label: '성공률', better: 'high', value: (m) => m.successRate, format: formatPercent },
  { label: '검색 적중률', better: 'high', value: (m) => m.hitRate, format: formatPercent },
  { label: '총 비용', better: 'low', value: (m) => m.costUsd, format: formatUsd },
  { label: '평균 지연', better: 'low', value: (m) => m.avgLatencyMs, format: formatMs },
  { label: 'p95 지연', better: 'low', value: (m) => m.p95LatencyMs, format: formatMs },
  { label: '평균 시도 횟수', better: 'low', value: (m) => m.avgAttempts, format: (v) => v.toFixed(2) },
  { label: '토큰 (입력+출력)', better: null, value: (m) => m.inputTokens + m.outputTokens, format: formatNumber },
]

// 실행마다 사람이 알아볼 수 있는 이름. 같은 이름이 겹치면 번호를 붙인다
function buildLabels(list: CompareRun[]): Map<string, string> {
  const base = list.map((run) => `${run.modelConfig.label} · ${run.prompt.name} v${run.prompt.version}`)
  const labels = new Map<string, string>()
  list.forEach((run, index) => {
    const duplicates = base.filter((name) => name === base[index]).length > 1
    labels.set(run.id, duplicates ? `${base[index]} #${index + 1}` : base[index])
  })
  return labels
}

export function ComparePage() {
  const workspaceId = useWorkspaceId()
  const [params] = useSearchParams()
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean)
  const valid = ids.length >= 2 && ids.length <= 6

  const compare = useResource(
    valid ? `compare:${ids.join(',')}` : null,
    () => runs.compare(workspaceId, ids),
    (data) => (data.runs.some((run) => isActive(run.status)) ? 2000 : null),
  )

  if (!valid) {
    return (
      <div className="space-y-3">
        <ErrorBox message="비교할 실행을 2~6개 골라 주세요." />
        <Link to="/" className={buttonSecondary}>
          실행 목록으로
        </Link>
      </div>
    )
  }
  if (compare.error && !compare.data) {
    return (
      <div className="space-y-3">
        <ErrorBox message={compare.error} />
        <Link to="/" className={buttonSecondary}>
          실행 목록으로
        </Link>
      </div>
    )
  }
  if (!compare.data) return <Loading />
  return <CompareView data={compare.data} error={compare.error} />
}

function CompareView({ data, error }: { data: CompareResponse; error: string | null }) {
  const labels = useMemo(() => buildLabels(data.runs), [data.runs])
  const colors = new Map(data.runs.map((run, index) => [run.id, RUN_COLORS[index % RUN_COLORS.length]]))
  const running = data.runs.some((run) => isActive(run.status))
  const scored = data.runs.some((run) => run.metrics.avgScore !== null)

  const scoreData = data.runs.map((run) => ({
    id: run.id,
    name: labels.get(run.id) ?? run.id,
    score: run.metrics.avgScore === null ? 0 : Math.round(run.metrics.avgScore * 1000) / 10,
  }))
  const latencyData = data.runs.map((run) => ({
    name: labels.get(run.id) ?? run.id,
    p50: run.metrics.p50LatencyMs,
    p95: run.metrics.p95LatencyMs,
  }))

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-slate-500 hover:underline">
          ← 실행 목록
        </Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-xl font-bold">실행 비교</h1>
          <span className="text-sm text-slate-500">데이터셋: {data.runs[0].dataset.name}</span>
          {running && <span className="text-sm text-blue-600">진행 중인 실행이 있어 자동으로 갱신됩니다</span>}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              className={buttonSecondary}
              onClick={() => downloadText('compare-report.md', buildMarkdown(data, labels), 'text/markdown')}
            >
              Markdown 내보내기
            </button>
            <button
              type="button"
              className={buttonSecondary}
              onClick={() => downloadText('compare-report.csv', buildCsv(data, labels), 'text/csv')}
            >
              CSV 내보내기
            </button>
          </div>
        </div>
      </div>
      {error && <ErrorBox message={error} />}
      {data.items.length > 0 && data.items.length < 30 && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          질문이 {data.items.length}개뿐이라 작은 점수 차이는 우연일 수 있습니다. 질문 수를 늘려서 다시 확인해 보세요.
        </p>
      )}

      <MetricsTable runs={data.runs} labels={labels} colors={colors} />

      <div className="grid gap-4 lg:grid-cols-2">
        {scored && (
          <ChartCard title="평균 점수 (%)">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={scoreData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => `${String(value)}%`} />
                <Bar dataKey="score" name="평균 점수">
                  {scoreData.map((entry) => (
                    <Cell key={entry.id} fill={colors.get(entry.id)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
        <ChartCard title="지연시간 (p50 / p95)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={latencyData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
              <YAxis tickFormatter={(value: number) => formatMs(value)} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => formatMs(Number(value))} />
              <Legend />
              <Bar dataKey="p50" name="p50" fill="#64748b" />
              <Bar dataKey="p95" name="p95" fill="#cbd5e1" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        {scored && (
          <ChartCard title="비용 대비 점수 (왼쪽 위일수록 저렴하고 정확)" wide>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="비용"
                  tickFormatter={(value: number) => formatUsd(value)}
                  tick={{ fontSize: 11 }}
                  label={{ value: '총 비용', position: 'insideBottom', offset: -12, fontSize: 12 }}
                />
                <YAxis type="number" dataKey="y" name="점수" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  formatter={(value, name) => (name === '비용' ? formatUsd(Number(value)) : `${String(value)}%`)}
                />
                <Legend />
                {data.runs.map((run) => (
                  <Scatter
                    key={run.id}
                    name={labels.get(run.id)}
                    data={
                      run.metrics.avgScore === null
                        ? []
                        : [{ x: run.metrics.costUsd, y: Math.round(run.metrics.avgScore * 1000) / 10 }]
                    }
                    fill={colors.get(run.id)}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      <ItemMatrix items={data.items} runs={data.runs} labels={labels} colors={colors} scored={scored} />
    </div>
  )
}

function ChartCard({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`${card} p-4 ${wide ? 'lg:col-span-2' : ''}`}>
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  )
}

function RunHeader({ run, label, color }: { run: CompareRun; label: string; color?: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <Link to={`/runs/${run.id}`} className="font-medium normal-case tracking-normal text-slate-800 hover:underline">
          {label}
        </Link>
      </div>
      <div className="mt-0.5 flex items-center gap-1 normal-case tracking-normal">
        <StatusBadge status={run.status} />
        {run.usesDocument && <span className="rounded bg-violet-100 px-1 text-xs text-violet-700">RAG</span>}
      </div>
    </div>
  )
}

function MetricsTable({
  runs: list,
  labels,
  colors,
}: {
  runs: CompareRun[]
  labels: Map<string, string>
  colors: Map<string, string>
}) {
  return (
    <div className={`${card} overflow-x-auto`}>
      <table className="w-full min-w-[640px]">
        <thead className="border-b border-slate-200">
          <tr>
            <th className={th} />
            {list.map((run) => (
              <th key={run.id} className={th}>
                <RunHeader run={run} label={labels.get(run.id) ?? run.id} color={colors.get(run.id)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {METRIC_ROWS.map((row) => {
            const values = list.map((run) => row.value(run.metrics))
            // 가장 좋은 값에 표시한다. 모두 같거나 값이 하나뿐이면 표시하지 않는다
            const present = values.filter((value): value is number => value !== null)
            const best =
              row.better && present.length > 1
                ? row.better === 'high'
                  ? Math.max(...present)
                  : Math.min(...present)
                : null
            const allSame = present.every((value) => value === present[0])
            if (present.length === 0) return null
            return (
              <tr key={row.label}>
                <td className={`${td} font-medium text-slate-600`}>{row.label}</td>
                {values.map((value, index) => (
                  <td
                    key={list[index].id}
                    className={`${td} tabular-nums ${
                      value !== null && value === best && !allSame ? 'font-semibold text-green-700' : ''
                    }`}
                  >
                    {value === null ? '-' : row.format(value)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

type MatrixFilter = 'all' | 'disagree' | 'allWrong'

// 한 질문에서 실행들의 결과를 숫자로 바꾼다 (실패 = -1, 채점 없음 = null)
function cellValue(cell: CompareCell | undefined): number | null {
  if (!cell) return null
  if (cell.status === 'FAILED') return -1
  return cell.score
}

function ItemMatrix({
  items,
  runs: list,
  labels,
  colors,
  scored,
}: {
  items: CompareItem[]
  runs: CompareRun[]
  labels: Map<string, string>
  colors: Map<string, string>
  scored: boolean
}) {
  const [filter, setFilter] = useState<MatrixFilter>('all')
  const [open, setOpen] = useState<string | null>(null)

  const shown = items.filter((item) => {
    if (filter === 'all') return true
    const values = list.map((run) => cellValue(item.cells[run.id])).filter((v): v is number => v !== null)
    if (filter === 'disagree') return new Set(values).size > 1
    return values.length > 0 && values.every((value) => value < 1)
  })

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">질문별 비교</h2>
        {scored && (
          <div className="ml-auto flex gap-1">
            {(
              [
                ['all', '전체'],
                ['disagree', '결과가 갈리는 질문'],
                ['allWrong', '모두 틀린 질문'],
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
        )}
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-slate-200">
            <tr>
              <th className={th}>#</th>
              <th className={th}>질문</th>
              {list.map((run) => (
                <th key={run.id} className={th}>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: colors.get(run.id) }} />
                  <span className="normal-case tracking-normal">{labels.get(run.id)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.length === 0 && (
              <tr>
                <td colSpan={list.length + 2} className="px-4 py-8 text-center text-sm text-slate-500">
                  조건에 맞는 질문이 없습니다.
                </td>
              </tr>
            )}
            {shown.map((item) => (
              <Fragment key={item.itemId}>
                <tr
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => setOpen(open === item.itemId ? null : item.itemId)}
                >
                  <td className={`${td} text-slate-400`}>{item.position + 1}</td>
                  <td className={`${td} max-w-xs truncate`}>{item.input}</td>
                  {list.map((run) => (
                    <td key={run.id} className={td}>
                      <CellChip cell={item.cells[run.id]} />
                    </td>
                  ))}
                </tr>
                {open === item.itemId && (
                  <tr className="bg-slate-50">
                    <td colSpan={list.length + 2} className="space-y-2 px-4 py-3 text-sm">
                      <div>
                        <div className="text-xs font-semibold text-slate-500">질문</div>
                        <div className="whitespace-pre-wrap">{item.input}</div>
                      </div>
                      {item.expected && (
                        <div>
                          <div className="text-xs font-semibold text-slate-500">정답</div>
                          <div className="whitespace-pre-wrap">{item.expected}</div>
                        </div>
                      )}
                      {list.map((run) => (
                        <div key={run.id}>
                          <div className="text-xs font-semibold text-slate-500">{labels.get(run.id)}</div>
                          <div className="whitespace-pre-wrap break-words">
                            {item.cells[run.id]?.output ?? <span className="text-slate-400">(응답 없음)</span>}
                          </div>
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CellChip({ cell }: { cell: CompareCell | undefined }) {
  if (!cell) return <span className="text-slate-300">-</span>
  if (cell.status === 'FAILED') return <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">실패</span>
  // 채점하지 않은 실행은 점수 대신 응답이 있다는 표시만 한다 (행을 누르면 내용이 보인다)
  if (cell.score === null) return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">응답</span>
  const style =
    cell.score >= 1
      ? 'bg-green-100 text-green-700'
      : cell.score <= 0
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700'
  return <span className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${style}`}>{formatPercent(cell.score)}</span>
}
