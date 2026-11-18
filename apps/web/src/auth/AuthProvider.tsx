import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { auth, workspaces } from '../api/endpoints.ts'
import { loadToken, saveToken, setUnauthorizedHandler } from '../api/client.ts'
import { AuthContext, type AuthState } from './auth-context.ts'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>(loadToken() ? 'loading' : 'anon')
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  const logout = useCallback(() => {
    saveToken(null)
    setWorkspaceId(null)
    setStatus('anon')
  }, [])

  // API 가 401 을 돌려주면(토큰 만료 등) 로그인 화면으로 보낸다
  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  // 토큰으로 워크스페이스를 불러온다. 가입 때 기본 워크스페이스가 하나 만들어진다
  const enter = useCallback(async () => {
    const list = await workspaces.list()
    if (list.length === 0) throw new Error('워크스페이스가 없습니다.')
    setWorkspaceId(list[0].id)
    setStatus('authed')
  }, [])

  useEffect(() => {
    if (!loadToken()) return
    enter().catch(() => setStatus('anon'))
  }, [enter])

  const login = useCallback(
    async (email: string, password: string) => {
      const { accessToken } = await auth.login(email, password)
      saveToken(accessToken)
      await enter()
    },
    [enter],
  )

  const signup = useCallback(
    async (email: string, password: string) => {
      const { accessToken } = await auth.signup(email, password)
      saveToken(accessToken)
      await enter()
    },
    [enter],
  )

  const value = useMemo<AuthState>(
    () => ({ status, workspaceId, login, signup, logout }),
    [status, workspaceId, login, signup, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
