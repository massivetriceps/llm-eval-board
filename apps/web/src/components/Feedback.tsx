import type { ReactNode } from 'react'

export function Loading({ label = '불러오는 중...' }: { label?: string }) {
  return <div className="py-10 text-center text-sm text-slate-500">{label}</div>
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {message}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}
