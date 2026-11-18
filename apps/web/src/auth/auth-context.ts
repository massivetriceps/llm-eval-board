import { createContext, useContext } from 'react'

export interface AuthState {
  status: 'loading' | 'authed' | 'anon'
  workspaceId: string | null
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider 안에서만 쓸 수 있습니다.')
  return value
}

// 로그인한 상태에서만 쓰는 화면용. workspaceId 가 항상 있다
export function useWorkspaceId(): string {
  const { workspaceId } = useAuth()
  if (!workspaceId) throw new Error('로그인이 필요합니다.')
  return workspaceId
}
