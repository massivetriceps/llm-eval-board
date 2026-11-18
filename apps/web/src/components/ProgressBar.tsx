import type { Progress } from '../api/types.ts'

export function ProgressBar({ progress }: { progress: Progress }) {
  const total = Math.max(progress.total, 1)
  const okPct = (progress.succeeded / total) * 100
  const failPct = (progress.failed / total) * 100
  return (
    <div>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.succeeded + progress.failed}
      >
        <div className="bg-blue-500" style={{ width: `${okPct}%` }} />
        <div className="bg-red-400" style={{ width: `${failPct}%` }} />
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {progress.succeeded + progress.failed}/{progress.total}
        {progress.failed > 0 && <span className="text-red-500"> (실패 {progress.failed})</span>}
      </div>
    </div>
  )
}
