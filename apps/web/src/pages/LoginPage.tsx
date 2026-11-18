import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/auth-context.ts'
import { ErrorBox } from '../components/Feedback.tsx'
import { buttonPrimary, card, input } from '../lib/ui.ts'

export function LoginPage() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await (mode === 'login' ? login(email, password) : signup(email, password))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className={`${card} w-full max-w-sm space-y-4 p-6`}>
        <div>
          <h1 className="text-xl font-bold">LLM Eval Board</h1>
          <p className="mt-1 text-sm text-slate-500">모델과 프롬프트를 같은 질문으로 비교합니다.</p>
        </div>
        {error && <ErrorBox message={error} />}
        <label className="block text-sm">
          <span className="mb-1 block font-medium">이메일</span>
          <input
            className={input}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">비밀번호</span>
          <input
            className={input}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'signup' && <span className="mt-1 block text-xs text-slate-500">8~72자</span>}
        </label>
        <button type="submit" className={`${buttonPrimary} w-full`} disabled={busy}>
          {busy ? '처리 중...' : mode === 'login' ? '로그인' : '가입하고 시작'}
        </button>
        <button
          type="button"
          className="w-full text-center text-sm text-slate-500 hover:text-slate-800"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? '계정이 없나요? 가입하기' : '이미 계정이 있나요? 로그인'}
        </button>
      </form>
    </div>
  )
}
