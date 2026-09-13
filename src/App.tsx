import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import LoginPage from './pages/LoginPage'
import UpdatePasswordPage from './pages/UpdatePasswordPage'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { useProfile } from './lib/profile'
import PendingPage from './pages/PendingPage'
import MembersPage from './pages/MembersPage'
import { showSplash } from './lib/splash'
import TreesPage from './pages/TreesPage'
import TreeLayout from './pages/TreeLayout'
import PeoplePage from './pages/PeoplePage'
import PersonPage from './pages/PersonPage'
import ChartPage from './pages/ChartPage'
import SourcesPage from './pages/SourcesPage'
import SourcePage from './pages/SourcePage'

/** True from the moment a password-recovery link lands until the user saves a new password. */
function useIsPasswordRecovery() {
  const [recovering, setRecovering] = useState(() => window.location.hash.includes('type=recovery'))
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'USER_UPDATED' || event === 'SIGNED_OUT') setRecovering(false)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  return recovering
}

/** Plays the two-second splash each time an approved member arrives in the app: on sign-in, and on opening the site already signed in. */
function useLoginSplash(ready: boolean) {
  const [shownFor, setShownFor] = useState<string | null>(null)
  const { session } = useAuth()
  const uid = session?.user.id ?? null
  useEffect(() => {
    if (ready && uid && shownFor !== uid) { setShownFor(uid); showSplash() }
    if (!uid && shownFor) setShownFor(null) // signed out: next sign-in plays it again
  }, [ready, uid, shownFor])
}

export default function App() {
  // Login is required. On this dev machine, VITE_DEV_EMAIL/PASSWORD in .env.local sign in automatically (see lib/auth.tsx).
  const { session, loading } = useAuth()
  const recovering = useIsPasswordRecovery()
  const profile = useProfile()
  const approved = !!session && !recovering && profile.data?.status === 'approved'
  useLoginSplash(approved)
  if (loading || (session && profile.isLoading)) return <div className="flex h-full items-center justify-center text-ink-mute">Loading…</div>
  if (!session) return <LoginPage />
  if (recovering) return <UpdatePasswordPage />
  if (profile.data?.status !== 'approved') return <PendingPage profile={profile.data ?? null} />
  return (
    <Routes>
      <Route path="/" element={<TreesPage />} />
      <Route path="/members" element={<MembersPage />} />
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
