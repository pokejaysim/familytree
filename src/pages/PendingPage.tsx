import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/profile'

/** Shown to signed-in accounts that an admin hasn't approved yet (or has declined). */
export default function PendingPage({ profile }: { profile: Profile | null }) {
  const declined = profile?.status === 'declined'
  return (
    <div className="flex h-full items-center justify-center bg-paper p-4">
      <div className="card w-full max-w-md space-y-4 text-center">
        <div className="text-[22px] font-medium text-moss">Sim Family Tree</div>
        {declined ? (
          <>
            <h1 className="text-2xl">This request wasn't approved</h1>
            <p className="text-ink-soft">If you think that's a mistake, get in touch with Jason directly.</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl">Thanks{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}. You're on the list.</h1>
            <p className="text-ink-soft">This tree holds details about living relatives, so every new account is checked by Jason before it can see anything. You'll be able to sign in and browse once that's done.</p>
            <p className="text-sm text-ink-mute">Signed in as {profile?.email}</p>
          </>
        )}
        <button className="btn-ghost mx-auto" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  )
}
