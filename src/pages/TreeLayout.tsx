import { Navigate, NavLink, Outlet, useParams } from 'react-router-dom'
import { useTree } from '../lib/queries'
import AppHeader, { BottomTabs, tabClass } from '../components/AppHeader'
import { BookMarked, GitFork, Users } from 'lucide-react'

export default function TreeLayout() {
  const { treeId = '' } = useParams()
  // A stale link to a tree that no longer exists (or one you can't see) goes home instead of showing an empty map.
  const { error } = useTree(treeId)
  if (error) return <Navigate to="/" replace />
  return (
    <div className="flex h-full flex-col">
      <AppHeader tabs={<>
        <NavLink to="chart" className={tabClass}>Map</NavLink>
        <NavLink to="people" className={tabClass}>People</NavLink>
        <NavLink to="sources" className={tabClass}>Sources</NavLink>
      </>} />
      <main className="min-h-0 flex-1 overflow-auto"><Outlet /></main>
      <BottomTabs items={[{ to: 'chart', label: 'Map', icon: <GitFork size={20} /> }, { to: 'people', label: 'People', icon: <Users size={20} /> }, { to: 'sources', label: 'Sources', icon: <BookMarked size={20} /> }]} />
    </div>
  )
}
