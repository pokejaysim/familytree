import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/profile'
import { ADMIN_NAME } from '../config'
import treeMark from '../assets/tree-mark.svg'
import divider from '../assets/branch-divider.svg'

/** Shown to signed-in accounts that an admin hasn't approved yet (or has declined). */
export default function PendingPage({ profile }: { profile: Profile | null }) {
  const declined = profile?.status === 'declined'
  return (
    <div className="flex h-full items-center justify-center bg-paper p-4">
      <div className="card w-full max-w-md space-y-4 text-center">
        <img src={treeMark} alt="" width={56} height={56} className="mx-auto" />
        <div className="text-[22px] font-medium text-moss">Sim Family Tree</div>
        <img src={divider} alt="" width={200} height={20} className="mx-auto opacity-90" />
        {declined ? (
          <>
            <h1 className="text-2xl">This request wasn't approved</h1>
            <p className="text-ink-soft">If you think that's a mistake, get in touch with {ADMIN_NAME} directly.</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl">Thanks{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}. You're on the list.</h1>
            <p className="text-ink-soft">This tree holds details about living relatives, so every new account is checked by {ADMIN_NAME} before it can see anything. You'll be able to sign in and browse once that's done.</p>
            <p className="text-sm text-ink-mute">Signed in as {profile?.email}</p>
          </>
        )}
        <button className="btn-ghost mx-auto" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  )
}
