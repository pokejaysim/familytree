import { NavLink, Outlet, Link, useParams } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useTree } from '../lib/queries'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

/** Moss header from the Kinfolk design: brand, uppercase nav with brass underline, user disc. */
export default function TreeLayout() {
  const { treeId = '' } = useParams()
  const { data: tree } = useTree(treeId)
  const { session } = useAuth()
  const initials = (session?.user.email ?? '?').slice(0, 2).toUpperCase()
  const tab = ({ isActive }: { isActive: boolean }) =>
    `pt-5 pb-[18px] text-[14px] uppercase tracking-[.12em] border-b transition ${isActive ? 'text-cream border-brass-light' : 'text-sage border-transparent hover:text-cream'}`
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[60px] shrink-0 items-center gap-10 bg-moss px-8">
        <Link to="/" className="text-[22px] font-medium tracking-[.01em] text-cream" title="All trees">Kinfolk</Link>
        <nav className="flex gap-7">
          <NavLink to="chart" className={tab}>Map</NavLink>
          <NavLink to="people" className={tab}>People</NavLink>
          <NavLink to="sources" className={tab}>Sources</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-4">
          {tree && <span className="hidden text-[14px] italic text-[#D6CFBF] sm:inline">{tree.name}</span>}
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-brass text-[13px] text-cream" title={session?.user.email}>{initials}</span>
          <button className="text-sage hover:text-cream" title="Sign out" onClick={() => supabase.auth.signOut()}><LogOut size={16} /></button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto"><Outlet /></main>
    </div>
  )
}
