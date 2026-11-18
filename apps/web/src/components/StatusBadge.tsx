import type { RunStatus } from '../api/types.ts'

const STYLES: Record<RunStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-600',
  RUNNING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-amber-100 text-amber-700',
}

const LABELS: Record<RunStatus, string> = {
  PENDING: '대기',
  RUNNING: '실행 중',
  COMPLETED: '완료',
  FAILED: '실패',
  CANCELLED: '취소됨',
}

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  )
}

export function isActive(status: RunStatus): boolean {
  return status === 'PENDING' || status === 'RUNNING'
}
