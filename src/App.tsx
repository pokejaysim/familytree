import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from './lib/auth'
import LoginPage, { type Notice } from './pages/LoginPage'
import { pb } from './lib/pb'
import UpdatePasswordPage from './pages/UpdatePasswordPage'
import { useEffect, useState } from 'react'
import { markWelcomed, useMeId, useProfile } from './lib/profile'
import { useQueryClient } from '@tanstack/react-query'
import PendingPage from './pages/PendingPage'
import { showSplash, takeSignIn, whenSplashDone } from './lib/splash'
import HelpPage from './pages/HelpPage'
import { useTreeData, useTrees } from './lib/queries'
import WelcomeTour from './components/WelcomeTour'
import { WELCOME_EVENT } from './lib/welcome'
import TreesPage from './pages/TreesPage'
import TreeLayout from './pages/TreeLayout'
import PeoplePage from './pages/PeoplePage'
import PersonPage from './pages/PersonPage'
import ChartPage from './pages/ChartPage'
import SourcesPage from './pages/SourcesPage'
import SourcePage from './pages/SourcePage'
import AboutPage from './pages/AboutPage'
import SupportPage from './pages/SupportPage'
import AdminPage from './pages/AdminPage'
import ContributePage from './pages/ContributePage'
import { Toaster, toast } from './lib/toast'

/**
 * Links from PocketBase's emails:
 * - …/?reset=<token> (forgot password) shows the new-password page until it's saved or cancelled;
 * - …/?confirm=<token> (from emails sent before sign-up was simplified) is confirmed straight away; it's no longer needed to sign in.
 * Either way the outcome becomes a notice on the sign-in page (and a toast for anyone already in).
 */
const handledConfirmations = new Set<string>() // React's dev double-run must not use a token twice
function useEmailLinks() {
  const [params, setParams] = useSearchParams()
  const [notice, setNotice] = useState<Notice | undefined>()
  const resetToken = params.get('reset')
  const confirmToken = params.get('confirm')
  useEffect(() => {
    if (!confirmToken || handledConfirmations.has(confirmToken)) return
    handledConfirmations.add(confirmToken)
    const tell = (n: Notice) => { setNotice(n); toast(n.ok ? 'saved' : 'error', n.text) }
    pb.collection('users').confirmVerification(confirmToken)
      .then(() => tell({ text: 'Thanks, your email is confirmed.', ok: true }))
      .catch(() => tell({ text: 'That confirmation link is old or was already used. You don’t need it any more: just sign in.' }))
      .finally(() => setParams((p) => { p.delete('confirm'); return p }, { replace: true }))
  }, [confirmToken, setParams])
  const resetDone = (message: string) => {
    setParams((p) => { p.delete('reset'); return p }, { replace: true })
    setNotice(message ? { text: message, ok: true } : undefined)
  }
  return { resetToken, resetDone, notice }
}

/** Plays the two-second splash when someone has just signed in with the form (not every time the site opens), once their account is approved. */
function useLoginSplash(ready: boolean) {
  useEffect(() => { if (ready && takeSignIn()) showSplash() }, [ready])
}

export default function App() {
  // Login is required. On this dev machine, VITE_DEV_EMAIL/PASSWORD in .env.local sign in automatically (see lib/auth.tsx).
  const { session, loading } = useAuth()
  const links = useEmailLinks()
  const profile = useProfile()
  const { pathname } = useLocation()
  const approved = !!session && !links.resetToken && profile.data?.status === 'approved'
  useLoginSplash(approved)
  if (links.resetToken) return <UpdatePasswordPage token={links.resetToken} onDone={links.resetDone} />
  if (loading || (session && profile.isLoading)) return <div className="flex h-full items-center justify-center text-ink-mute">Loading…</div>
  // Help is open to everyone: people who can't sign in, or are waiting for approval, need it most.
  if (pathname === '/help' && (!session || (profile.data && profile.data.status !== 'approved'))) return <HelpPage />
  if (!session) return <LoginPage notice={links.notice} />
  // Couldn't load the account (no connection, or the server is restarting): say so, rather than showing the "waiting for approval" page.
  if (!profile.data && profile.isError) return <CantConnect onRetry={() => profile.refetch()} busy={profile.isFetching} />
  if (profile.data?.status !== 'approved') return <PendingPage profile={profile.data ?? null} />
  return (
    <>
    <Toaster />
    <Welcome />
    <Routes>
      <Route path="/" element={<TreesPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/members" element={<Navigate to="/admin" replace />} />
      <Route path="/support" element={<SupportPage />} />
      <Route path="/review" element={<Navigate to="/admin" replace />} />
      <Route path="/contribute" element={<ContributePage />} />
      <Route path="/help" element={<HelpPage />} />
      <Route path="/trees/:treeId" element={<TreeLayout />}>
        <Route index element={<Navigate to="chart" replace />} />
        <Route path="chart" element={<ChartPage />} />
        <Route path="chart/:personId" element={<ChartPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="people/:personId" element={<PersonPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="sources/:sourceId" element={<SourcePage />} />
        <Route path="about" element={<AboutPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}

/**
 * The welcome video: plays once per member, on their first sign-in (the account's welcomed_at
 * is empty), after the sign-in splash has gone. Closing or finishing it marks it seen on the server.
 * "Watch the welcome again" on the Contribute page replays it any time.
 * Waits for the tree to load so the first scene can say how many people are in it.
 */
function Welcome() {
  const { data: profile } = useProfile()
  const qc = useQueryClient()
  const meId = useMeId()
  const { data: trees } = useTrees()
  const treeId = trees?.[0]?.id ?? ''
  const { data } = useTreeData(treeId)
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const firstTime = !!profile && !profile.welcomed_at
  useEffect(() => {
    // A tick later, so the splash (started by App's own effect, which runs after this one) is already playing.
    const t = firstTime ? window.setTimeout(() => whenSplashDone().then(() => setOpen(true)), 0) : undefined
    return () => window.clearTimeout(t)
  }, [firstTime])
  useEffect(() => {
    const replay = () => setOpen(true)
    window.addEventListener(WELCOME_EVENT, replay)
    return () => window.removeEventListener(WELCOME_EVENT, replay)
  }, [])
  if (!open || !profile || (treeId && !data)) return null
  const close = () => {
    setOpen(false)
    if (firstTime) markWelcomed().then(() => qc.invalidateQueries({ queryKey: ['profile'] })).catch(() => { /* plays again next sign-in; harmless */ })
  }
  return <WelcomeTour data={data} meId={meId} role={profile.role} onClose={close} onStart={() => { close(); nav('/') }} onOpenMap={treeId ? () => { close(); nav(`/trees/${treeId}/chart`) } : null} />
}

/** Shown when the site can't reach the family tree server. Tries again by itself when the device comes back online. */
function CantConnect({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  useEffect(() => {
    window.addEventListener('online', onRetry)
    return () => window.removeEventListener('online', onRetry)
  }, [onRetry])
  return (
    <div className="flex h-full items-center justify-center bg-paper p-4">
      <div role="alert" className="card w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl">Can’t reach the family tree right now</h1>
        <p className="text-ink-soft">Check your internet connection and try again. If it still doesn’t load, the site may be restarting; give it a minute.</p>
        <button className="btn-primary mx-auto" disabled={busy} onClick={onRetry}>{busy ? 'Trying…' : 'Try again'}</button>
      </div>
    </div>
  )
}
