import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { runs } from '../api/endpoints.ts'
import type { RunListItem } from '../api/types.ts'
import { useWorkspaceId } from '../auth/auth-context.ts'
import { EmptyState, ErrorBox, Loading } from '../components/Feedback.tsx'
import { ProgressBar } from '../components/ProgressBar.tsx'
import { StatusBadge, isActive } from '../components/StatusBadge.tsx'
import { formatDate, formatMs, formatPercent, formatUsd } from '../lib/format.ts'
import { buttonPrimary, buttonSecondary, card, td, th } from '../lib/ui.ts'
import { useResource } from '../lib/useResource.ts'

const SCORER_LABELS = { none: '-', exact: '정답 일치', contains: '정답 포함', judge: 'LLM 심판' }

export function RunsPage() {
  const workspaceId = useWorkspaceId()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string[]>([])
  // 진행 중인 실행이 있을 때만 주기적으로 다시 불러온다
  const list = useResource(
    `runs:${workspaceId}`,
    () => runs.list(workspaceId),
    (data) => (data.some((run) => isActive(run.status)) ? 2000 : null),
  )

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id].slice(-6),
    )
  }

  const chosen = (list.data ?? []).filter((run) => selected.includes(run.id))
  const datasets = new Set(chosen.map((run) => run.dataset.name))
  const sameDataset = datasets.size <= 1
  const canCompare = chosen.length >= 2 && sameDataset

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">실행 목록</h1>
        <div className="ml-auto flex items-center gap-2">
          {chosen.length >= 2 && !sameDataset && (
            <span className="text-xs text-amber-600">같은 데이터셋끼리만 비교할 수 있어요</span>
          )}
          <button
            type="button"
            className={buttonSecondary}
            disabled={!canCompare}
            onClick={() => navigate(`/compare?ids=${selected.join(',')}`)}
          >
            선택한 {chosen.length}개 비교
          </button>
          <Link to="/runs/new" className={buttonPrimary}>
            새 실행
          </Link>
        </div>
      </div>

      {list.error && <ErrorBox message={list.error} />}
      {list.loading && <Loading />}
      {list.data && list.data.length === 0 && (
        <EmptyState>
          아직 실행이 없습니다. 먼저{' '}
          <Link to="/library" className="text-blue-600 underline">
            라이브러리
          </Link>
          에서 데이터셋·프롬프트·모델을 만든 뒤 새 실행을 시작해 보세요.
        </EmptyState>
      )}
      {list.data && list.data.length > 0 && (
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={th} />
                <th className={th}>상태</th>
                <th className={th}>데이터셋</th>
                <th className={th}>프롬프트</th>
                <th className={th}>모델</th>
                <th className={th}>채점</th>
                <th className={`${th} w-36`}>진행</th>
                <th className={th}>점수</th>
                <th className={th}>비용</th>
                <th className={th}>평균 지연</th>
                <th className={th}>시작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  checked={selected.includes(run.id)}
                  onToggle={() => toggle(run.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RunRow({
  run,
  checked,
  onToggle,
}: {
  run: RunListItem
  checked: boolean
  onToggle: () => void
}) {
  return (
    <tr className="hover:bg-slate-50">
      <td className={td}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label="비교할 실행 선택"
        />
      </td>
      <td className={td}>
        <Link to={`/runs/${run.id}`} className="hover:underline">
          <StatusBadge status={run.status} />
        </Link>
      </td>
      <td className={td}>{run.dataset.name}</td>
      <td className={td}>
        {run.prompt.name} <span className="text-slate-400">v{run.prompt.version}</span>
      </td>
      <td className={td}>
        <Link to={`/runs/${run.id}`} className="font-medium text-blue-700 hover:underline">
          {run.modelConfig.label}
        </Link>
        <div className="text-xs text-slate-400">{run.modelConfig.model}</div>
      </td>
      <td className={td}>
        {SCORER_LABELS[run.scorer]}
        {run.documentId && <span className="ml-1 rounded bg-violet-100 px-1 text-xs text-violet-700">RAG</span>}
      </td>
      <td className={td}>
        <ProgressBar progress={run.progress} />
      </td>
      <td className={`${td} tabular-nums`}>{formatPercent(run.summary.avgScore)}</td>
      <td className={`${td} tabular-nums`}>{formatUsd(run.summary.costUsd)}</td>
      <td className={`${td} tabular-nums`}>{formatMs(run.summary.avgLatencyMs)}</td>
      <td className={`${td} text-slate-500`}>{formatDate(run.startedAt ?? run.createdAt)}</td>
    </tr>
  )
}
