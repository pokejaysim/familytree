import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { ClipboardCheck, LogOut, Menu, PenLine, UserRound, Users, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { signOut, useAuth } from '../lib/auth'
import { useIsAdmin, usePendingCount, useProfile } from '../lib/profile'
import { usePendingReviewCount } from '../lib/changes'
import { usePerson } from '../lib/queries'
import treeMarkLight from '../assets/tree-mark-light.svg'

/** Moss header: brand, optional tree tabs, Contribute / Review / Members with pending badges, user disc. On phones the links fold into a labelled menu. */
export default function AppHeader({ tabs }: { tabs?: ReactNode }) {
  const { session } = useAuth()
  const { data: profile } = useProfile()
  const isAdmin = useIsAdmin()
  const { data: pending = 0 } = usePendingCount(isAdmin)
  const { data: toReview = 0 } = usePendingReviewCount(isAdmin)
  const linked = profile?.person_status === 'approved' ? profile.person_id : null
  const { data: me } = usePerson(linked ?? '')
  const navCls = ({ isActive }: { isActive: boolean }) => `relative text-[15px] transition-colors ${isActive ? 'text-cream' : 'text-sage hover:text-cream'}`
  const badge = (n: number) => n > 0 && <span className="absolute -top-2 -right-4 flex h-4 min-w-4 items-center justify-center rounded-full bg-brass-light px-1 text-[11px] font-semibold text-moss">{n}</span>
  const label = profile?.name || session?.user.email || '?'
  const initials = label.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const myProfile = me ? `/trees/${me.tree_id}/people/${me.id}` : null
  return (
    <header className="relative flex min-h-[56px] sm:min-h-[60px] shrink-0 items-center gap-4 sm:gap-10 bg-moss px-3 sm:px-8" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <Link to="/" className="flex items-center gap-2 whitespace-nowrap text-[17px] sm:text-[22px] font-medium text-cream" title="Home"><img src={treeMarkLight} alt="" width={30} height={30} className="h-[26px] w-[26px] sm:h-[30px] sm:w-[30px]" />Sim Family Tree</Link>
      {tabs && <nav className="hidden gap-7 sm:flex">{tabs}</nav>}
      <div className="ml-auto hidden items-center gap-7 sm:flex">
        <NavLink to="/contribute" className={navCls}>Contribute</NavLink>
        {isAdmin && <NavLink to="/review" title="Review suggested changes" className={navCls}>Review{badge(toReview)}</NavLink>}
        {isAdmin && <NavLink to="/members" className={navCls}>Members{badge(pending)}</NavLink>}
        {session && (myProfile
          ? <Link to={myProfile} className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-brass text-[13px] text-cream hover:ring-2 hover:ring-cream/60" title={`${label}: open your profile`} aria-label="Your profile">{initials}</Link>
          : <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-brass text-[13px] text-cream" title={label}>{initials}</span>)}
        {session && <button className="text-sage transition-colors hover:text-cream" title="Sign out" aria-label="Sign out" onClick={signOut}><LogOut size={18} /></button>}
      </div>
      {session && <PhoneMenu isAdmin={isAdmin} toReview={toReview} pending={pending} myProfile={myProfile} />}
    </header>
  )
}

/** Phone-only menu: every destination with its name written out, instead of a row of guessable icons. */
function PhoneMenu({ isAdmin, toReview, pending, myProfile }: { isAdmin: boolean; toReview: number; pending: number; myProfile: string | null }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey); window.addEventListener('pointerdown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
  }, [open])
  const waiting = isAdmin ? toReview + pending : 0
  const row = 'flex min-h-11 items-center gap-3 px-4 text-[16px] text-ink hover:bg-moss-light'
  const count = (n: number) => n > 0 && <span className="ml-auto rounded-full bg-brass-light px-2 text-[13px] font-semibold text-moss">{n}</span>
  return (
    <div ref={box} className="ml-auto sm:hidden">
      <button className="relative flex min-h-10 items-center gap-1.5 rounded px-2 text-[16px] text-cream" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        {open ? <X size={20} /> : <Menu size={20} />} Menu
        {waiting > 0 && !open && <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brass-light px-1 text-[11px] font-semibold text-moss">{waiting}</span>}
      </button>
      {open && (
        <nav role="menu" className="absolute top-full right-2 z-50 mt-1 w-64 overflow-hidden rounded-md border border-line bg-white py-1 shadow-card">
          {myProfile && <Link role="menuitem" to={myProfile} className={row}><UserRound size={18} className="text-moss" /> Your profile</Link>}
          <NavLink role="menuitem" to="/contribute" className={row}><PenLine size={18} className="text-moss" /> How to contribute</NavLink>
          {isAdmin && <NavLink role="menuitem" to="/review" className={row}><ClipboardCheck size={18} className="text-moss" /> Review changes{count(toReview)}</NavLink>}
          {isAdmin && <NavLink role="menuitem" to="/members" className={row}><Users size={18} className="text-moss" /> Members{count(pending)}</NavLink>}
          <button role="menuitem" className={`${row} w-full border-t border-line`} onClick={signOut}><LogOut size={18} className="text-moss" /> Sign out</button>
        </nav>
      )}
    </div>
  )
}

/** Phone-only bottom tab bar (the header carries the tabs on wider screens). */
export function BottomTabs({ items }: { items: { to: string; label: string; icon: ReactNode }[] }) {
  return (
    <nav className="flex shrink-0 border-t border-line bg-white sm:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} className={({ isActive }) => `flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[13px] ${isActive ? 'text-moss font-medium' : 'text-ink-mute'}`}>
          {it.icon}{it.label}
        </NavLink>
      ))}
    </nav>
  )
}

export const tabClass = ({ isActive }: { isActive: boolean }) =>
  `pt-5 pb-[18px] text-[15px] border-b transition-colors ${isActive ? 'text-cream border-brass-light' : 'text-sage border-transparent hover:text-cream'}`
