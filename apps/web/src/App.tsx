import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/auth-context.ts'
import { Layout } from './components/Layout.tsx'
import { Loading } from './components/Feedback.tsx'
import { LibraryPage } from './pages/LibraryPage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { NewRunPage } from './pages/NewRunPage.tsx'
import { RunDetailPage } from './pages/RunDetailPage.tsx'
import { RunsPage } from './pages/RunsPage.tsx'

// 차트 라이브러리가 커서 비교 화면은 들어갈 때 불러온다
const ComparePage = lazy(() =>
  import('./pages/ComparePage.tsx').then((module) => ({ default: module.ComparePage })),
)

export default function App() {
  const { status } = useAuth()
  if (status === 'loading') return <Loading />
  if (status === 'anon') {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    )
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<RunsPage />} />
        <Route path="runs/new" element={<NewRunPage />} />
        <Route path="runs/:runId" element={<RunDetailPage />} />
        <Route
          path="compare"
          element={
            <Suspense fallback={<Loading />}>
              <ComparePage />
            </Suspense>
          }
        />
        <Route path="library" element={<LibraryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
