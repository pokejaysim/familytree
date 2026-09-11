import { NavLink, Outlet, Link, useParams } from 'react-router-dom'
import { BookMarked, ChevronLeft, GitFork, Users } from 'lucide-react'
import { useTree } from '../lib/queries'

export default function TreeLayout() {
  const { treeId = '' } = useParams()
  const { data: tree } = useTree(treeId)
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-moss-light text-moss font-medium' : 'text-ink/70 hover:bg-moss-light/60'}`
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-line bg-white px-4 py-2">
        <Link to="/" className="flex items-center gap-1 text-sm text-ink/60 hover:text-ink"><ChevronLeft size={16} /> Trees</Link>
        <h1 className="font-serif text-lg">{tree?.name ?? '…'}</h1>
        <nav className="ml-auto flex gap-1">
          <NavLink to="chart" className={tab}><GitFork size={16} /> Chart</NavLink>
          <NavLink to="people" className={tab}><Users size={16} /> People</NavLink>
          <NavLink to="sources" className={tab}><BookMarked size={16} /> Sources</NavLink>
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-auto"><Outlet /></main>
    </div>
  )
}
