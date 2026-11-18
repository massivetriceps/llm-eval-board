import { useCallback, useEffect, useRef, useState } from 'react'

interface State<T> {
  key: string | null
  data: T | null
  error: string | null
}

export interface Resource<T> {
  data: T | null
  error: string | null
  // 처음 불러오는 중일 때만 true (폴링 중 다시 불러올 때는 false)
  loading: boolean
  reload: () => void
}

// 폴링 간격(ms). 숫자면 고정, 함수면 방금 받은 데이터를 보고 정한다 (null 이면 멈춤)
export type Interval<T> = number | null | ((data: T) => number | null)

const RETRY_AFTER_ERROR_MS = 3000

// key 가 바뀌면 새로 불러오고, interval 이 있으면 응답이 끝난 뒤 그만큼 쉬었다가 다시 불러온다.
// key 가 null 이면 아무것도 하지 않는다. 폴링 중 오류가 나도 이전 데이터는 유지한다.
export function useResource<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
  interval: Interval<T> = null,
): Resource<T> {
  const [state, setState] = useState<State<T>>({ key: null, data: null, error: null })
  const [tick, setTick] = useState(0)
  const loadRef = useRef(load)
  const intervalRef = useRef(interval)

  useEffect(() => {
    loadRef.current = load
    intervalRef.current = interval
  })

  useEffect(() => {
    if (key === null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    let last: { data: T } | null = null

    const nextDelay = (): number | null => {
      const current = intervalRef.current
      if (typeof current !== 'function') return current
      return last ? current(last.data) : null
    }

    const run = async () => {
      try {
        const data = await loadRef.current(controller.signal)
        if (cancelled) return
        last = { data }
        setState({ key, data, error: null })
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        setState((prev) => ({ key, data: prev.key === key ? prev.data : null, error: message }))
        const delay = nextDelay()
        if (delay !== null) timer = setTimeout(run, Math.max(delay, RETRY_AFTER_ERROR_MS))
        return
      }
      const delay = nextDelay()
      if (!cancelled && delay !== null) timer = setTimeout(run, delay)
    }
    void run()

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [key, tick])

  const reload = useCallback(() => setTick((value) => value + 1), [])
  // 다른 key 의 이전 데이터가 잠깐 보이지 않도록 key 가 같을 때만 쓴다
  const current: State<T> =
    state.key === key ? state : { key, data: null, error: null }
  return {
    data: current.data,
    error: current.error,
    loading: key !== null && current.data === null && current.error === null,
    reload,
  }
}
