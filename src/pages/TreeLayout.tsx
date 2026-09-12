import { NavLink, Outlet, useParams } from 'react-router-dom'
import { useTree } from '../lib/queries'
import AppHeader, { tabClass } from '../components/AppHeader'

export default function TreeLayout() {
  const { treeId = '' } = useParams()
  useTree(treeId) // warm the cache for the chart title
  return (
    <div className="flex h-full flex-col">
      <AppHeader tabs={<>
        <NavLink to="chart" className={tabClass}>Map</NavLink>
        <NavLink to="people" className={tabClass}>People</NavLink>
        <NavLink to="sources" className={tabClass}>Sources</NavLink>
      </>} />
      <main className="min-h-0 flex-1 overflow-auto"><Outlet /></main>
    </div>
  )
}
