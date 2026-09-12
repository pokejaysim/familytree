import { Link, NavLink } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useIsAdmin, usePendingCount, useProfile } from '../lib/profile'

/** Moss header: brand, optional tree tabs, Members (admins) with a pending badge, user disc. */
export default function AppHeader({ tabs }: { tabs?: ReactNode }) {
  const { session } = useAuth()
  const { data: profile } = useProfile()
  const isAdmin = useIsAdmin()
  const { data: pending = 0 } = usePendingCount(isAdmin)
  const label = profile?.name || session?.user.email || '?'
  const initials = label.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <header className="flex h-[56px] sm:h-[60px] shrink-0 items-center gap-4 sm:gap-10 bg-moss px-3 sm:px-8" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <Link to="/" className="whitespace-nowrap text-[17px] sm:text-[22px] font-medium tracking-[.01em] text-cream" title="All trees">Sim Family Tree</Link>
      {tabs && <nav className="flex gap-3 sm:gap-7">{tabs}</nav>}
      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        {isAdmin && (
          <NavLink to="/members" className={({ isActive }) => `relative text-[12px] sm:text-[14px] uppercase tracking-[.1em] ${isActive ? 'text-cream' : 'text-sage hover:text-cream'}`}>
            Members
            {pending > 0 && <span className="absolute -top-2 -right-4 flex h-4 min-w-4 items-center justify-center rounded-full bg-brass-light px-1 text-[10px] font-semibold tracking-normal text-moss">{pending}</span>}
          </NavLink>
        )}
        {session && <span className="flex h-[30px] w-[30px] sm:h-[34px] sm:w-[34px] items-center justify-center rounded-full bg-brass text-[12px] sm:text-[13px] text-cream" title={`${label} · ${profile?.role ?? ''}`}>{initials}</span>}
        {session && <button className="hidden text-sage hover:text-cream sm:block" title="Sign out" onClick={() => supabase.auth.signOut()}><LogOut size={16} /></button>}
      </div>
    </header>
  )
}

export const tabClass = ({ isActive }: { isActive: boolean }) =>
  `pt-5 pb-[18px] text-[12px] sm:text-[14px] uppercase tracking-[.1em] sm:tracking-[.12em] border-b transition ${isActive ? 'text-cream border-brass-light' : 'text-sage border-transparent hover:text-cream'}`
