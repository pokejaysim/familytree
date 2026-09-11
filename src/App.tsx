import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import LoginPage from './pages/LoginPage'
import TreesPage from './pages/TreesPage'
import TreeLayout from './pages/TreeLayout'
import PeoplePage from './pages/PeoplePage'
import PersonPage from './pages/PersonPage'
import ChartPage from './pages/ChartPage'
import SourcesPage from './pages/SourcesPage'
import SourcePage from './pages/SourcePage'

export default function App() {
  const { session, loading } = useAuth()
  if (loading) return <div className="flex h-full items-center justify-center text-ink/50">Loading…</div>
  if (!session) return <LoginPage />
  return (
    <Routes>
      <Route path="/" element={<TreesPage />} />
      <Route path="/trees/:treeId" element={<TreeLayout />}>
        <Route index element={<Navigate to="chart" replace />} />
        <Route path="chart" element={<ChartPage />} />
        <Route path="chart/:personId" element={<ChartPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="people/:personId" element={<PersonPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="sources/:sourceId" element={<SourcePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
