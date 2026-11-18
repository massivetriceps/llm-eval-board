const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
const TOKEN_KEY = 'llm-eval-board.token'

// localStorage 는 막혀 있을 수 있어서(시크릿 모드 등) 실패해도 앱이 죽지 않게 한다
export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 저장하지 못하면 새로고침 때 다시 로그인하게 된다
  }
}

export class ApiError extends Error {
  status: number
  // 삭제 보호(409)처럼 화면이 분기해야 하는 오류만 서버가 code 를 붙여 준다
  code?: string
  runCount?: number

  constructor(message: string, status: number, extra: { code?: string; runCount?: number } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = extra.code
    this.runCount = extra.runCount
  }
}

// 토큰이 만료되거나 틀렸을 때 AuthContext 가 로그아웃 처리하도록 알린다
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

interface RequestOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  // 로그인 요청처럼 401 이 "자격 증명 오류"인 경우에는 자동 로그아웃하지 않는다
  skipAuthRedirect?: boolean
}

function messageFrom(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'message' in data) {
    const message = (data as { message: unknown }).message
    if (Array.isArray(message)) return message.join('\n')
    if (typeof message === 'string') return message
  }
  return fallback
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...options.headers }
  const token = loadToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('서버에 연결할 수 없습니다. API 서버가 켜져 있는지 확인해 주세요.', 0)
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !options.skipAuthRedirect) onUnauthorized?.()
    const body = typeof data === 'object' && data !== null ? (data as { code?: unknown; runCount?: unknown }) : {}
    throw new ApiError(messageFrom(data, `요청에 실패했습니다. (${response.status})`), response.status, {
      code: typeof body.code === 'string' ? body.code : undefined,
      runCount: typeof body.runCount === 'number' ? body.runCount : undefined,
    })
  }
  return data as T
}
