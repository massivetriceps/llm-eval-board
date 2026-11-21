import { useState } from 'react'
import { ApiError } from '../api/client.ts'

// 목록에서 체크한 항목 id 를 들고 있는다
export function useSelection() {
  const [ids, setIds] = useState<string[]>([])
  return {
    ids,
    has: (id: string) => ids.includes(id),
    toggle: (id: string) => setIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id])),
    setAll: (all: string[]) => setIds(all),
    clear: () => setIds([]),
  }
}

export interface BulkResult {
  deleted: number
  // 서버가 409 로 막은 항목 (실행 기록이 있거나 진행 중)
  skipped: number
  failed: number
  firstError: string | null
}

// 하나씩 지우되 한 건이 막혀도 나머지는 계속 지운다. 막힌 건 건너뛴 것으로 센다
export async function removeMany(ids: string[], remove: (id: string) => Promise<unknown>): Promise<BulkResult> {
  const settled = await Promise.allSettled(ids.map((id) => remove(id)))
  const result: BulkResult = { deleted: 0, skipped: 0, failed: 0, firstError: null }
  for (const item of settled) {
    if (item.status === 'fulfilled') {
      result.deleted += 1
    } else if (item.reason instanceof ApiError && item.reason.status === 409) {
      result.skipped += 1
    } else {
      result.failed += 1
      result.firstError ??= item.reason instanceof Error ? item.reason.message : String(item.reason)
    }
  }
  return result
}

export function summarize(result: BulkResult, skippedReason: string): string {
  const parts = [`${result.deleted}개 삭제`]
  if (result.skipped > 0) parts.push(`${result.skipped}개는 ${skippedReason} 건너뜀`)
  if (result.failed > 0) parts.push(`${result.failed}개 실패${result.firstError ? ` (${result.firstError})` : ''}`)
  return parts.join(', ')
}
