import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { pb } from './pb'

export interface Session { user: { id: string; email: string } }
interface AuthState { session: Session | null; loading: boolean }
const AuthCtx = createContext<AuthState>({ session: null, loading: true })

/**
 * Local development convenience: when running `npm run dev` with VITE_PB_DEV_EMAIL / VITE_PB_DEV_PASSWORD
 * in .env.local (git-ignored; a made-up account on the PocketBase test copy), sign in automatically so the
 * login screen never shows on this machine. Production builds ignore these variables entirely.
 */
const DEV_EMAIL = import.meta.env.DEV ? (import.meta.env.VITE_PB_DEV_EMAIL as string | undefined) : undefined
const DEV_PASSWORD = import.meta.env.DEV ? (import.meta.env.VITE_PB_DEV_PASSWORD as string | undefined) : undefined

const current = (): Session | null => {
  const r = pb.authStore.record
  return pb.authStore.isValid && r && r.collectionName === 'users' ? { user: { id: r.id, email: String(r.email ?? '') } } : null
}

export const signOut = () => pb.authStore.clear()

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [state, setState] = useState<AuthState>({ session: current(), loading: true })
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // A saved sign-in from an earlier visit: refresh it (this also checks the account still exists).
      // Only a rejected sign-in ends the session. A patchy connection, a busy server or the server restarting
      // keeps the saved sign-in, so relatives aren't sent back to the password screen for nothing.
      if (pb.authStore.isValid) await pb.collection('users').authRefresh().catch((e: { status?: number }) => { if (e?.status === 401 || e?.status === 403 || e?.status === 404) pb.authStore.clear() })
      if (!pb.authStore.isValid && DEV_EMAIL && DEV_PASSWORD) {
        await pb.collection('users').authWithPassword(DEV_EMAIL, DEV_PASSWORD).catch((e) => console.warn('Dev auto-login failed:', e?.message))
      }
      if (!cancelled) setState({ session: current(), loading: false })
    })()
    const stop = pb.authStore.onChange(() => {
      const session = current()
      if (!session) qc.clear() // signed out: forget everything the last account loaded
      setState((s) => (s.session?.user.id === session?.user.id && !s.loading ? s : { session, loading: s.loading }))
    })
    return () => { cancelled = true; stop() }
  }, [qc])
  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
