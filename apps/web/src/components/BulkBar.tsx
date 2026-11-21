import { buttonDanger } from '../lib/ui.ts'

interface Props {
  total: number
  checked: number
  onToggleAll: (all: boolean) => void
  onDelete: () => void
  busy: boolean
  notice: string | null
}

// 목록 위의 "전체 선택 / 선택 삭제" 줄
export function BulkBar({ total, checked, onToggleAll, onDelete, busy, notice }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-1.5 text-slate-600">
        <input
          type="checkbox"
          checked={total > 0 && checked === total}
          onChange={(event) => onToggleAll(event.target.checked)}
          aria-label="전체 선택"
        />
        전체 선택
      </label>
      <button type="button" className={buttonDanger} disabled={checked === 0 || busy} onClick={onDelete}>
        선택 삭제{checked > 0 ? ` (${checked})` : ''}
      </button>
      {notice && <span className="text-xs text-amber-600">{notice}</span>}
    </div>
  )
}
