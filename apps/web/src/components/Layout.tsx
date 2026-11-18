import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/auth-context.ts'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
  }`

export function Layout() {
  const { logout } = useAuth()
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
          <span className="mr-4 text-base font-bold">LLM Eval Board</span>
          <nav className="flex gap-1">
            <NavLink to="/" end className={linkClass}>
              실행 목록
            </NavLink>
            <NavLink to="/runs/new" className={linkClass}>
              새 실행
            </NavLink>
            <NavLink to="/library" className={linkClass}>
              라이브러리
            </NavLink>
          </nav>
          <button
            type="button"
            onClick={logout}
            className="ml-auto rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
          >
            로그아웃
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
