import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { signOut } from '../lib/auth'
import type { Profile } from '../lib/profile'
import { ADMIN_NAME } from '../config'
import treeMark from '../assets/tree-mark.svg'
import divider from '../assets/branch-divider.svg'

/**
 * Shown to signed-in accounts an admin hasn't approved yet (or has declined). Sign-up lands here
 * straight away. It checks every 20 seconds, and whenever the tab comes back into view, so the
 * moment the account is approved the site opens by itself. They also get a "You're in" email.
 */
export default function PendingPage({ profile }: { profile: Profile | null }) {
  const declined = profile?.status === 'declined'
  const qc = useQueryClient()
  useEffect(() => {
    if (declined) return
    const check = () => { if (!document.hidden) qc.invalidateQueries({ queryKey: ['profile'] }) }
    const t = window.setInterval(check, 20_000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check) }
  }, [declined, qc])
  const first = profile?.name?.trim().split(/\s+/)[0]

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-paper p-4">
      <div className="card w-full max-w-md space-y-4 text-center">
        <img src={treeMark} alt="" width={56} height={56} className="mx-auto" />
        <div className="text-[22px] font-medium text-moss">Sim Family Tree</div>
        <img src={divider} alt="" width={200} height={20} className="mx-auto opacity-90" />
        {declined ? (
          <>
            <h1 className="text-2xl">This request wasn’t approved</h1>
            <p className="text-ink-soft">If you think that’s a mistake, send {ADMIN_NAME} a message from the Help page.</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl">Thanks{first ? `, ${first}` : ''}. You’re on the list.</h1>
            <p className="text-[16px] leading-relaxed text-ink-soft">{ADMIN_NAME} looks at every new account personally, because the tree has details about living relatives. That usually takes a day or two.</p>
            <p className="text-[16px] leading-relaxed text-ink-soft">
              You’ll get an email at <span className="font-medium text-ink [overflow-wrap:anywhere]">{profile?.email}</span> as soon as you’re in.
              There’s nothing else to do: this page opens the tree by itself, and next time you visit you’ll go straight in.
            </p>
            <p className="text-[14px] text-ink-mute">Not your email address? Sign out and sign up again with the right one.</p>
          </>
        )}
        <p className="text-[15px]"><Link to="/help" className="text-brass underline underline-offset-4 hover:text-moss">Questions? Get help or send {ADMIN_NAME} a message</Link></p>
        <button className="btn-ghost mx-auto" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )
}
