import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthState { session: Session | null; loading: boolean }
const AuthCtx = createContext<AuthState>({ session: null, loading: true })

/**
 * Local development convenience: when running `npm run dev` with VITE_DEV_EMAIL / VITE_DEV_PASSWORD
 * in .env.local (git-ignored), sign in automatically so the login screen never shows on this machine.
 * Production builds ignore these variables entirely.
 */
const DEV_EMAIL = import.meta.env.DEV ? (import.meta.env.VITE_DEV_EMAIL as string | undefined) : undefined
const DEV_PASSWORD = import.meta.env.DEV ? (import.meta.env.VITE_DEV_PASSWORD as string | undefined) : undefined

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true })
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session && DEV_EMAIL && DEV_PASSWORD) {
        const { data: d, error } = await supabase.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD })
        if (error) console.warn('Dev auto-login failed:', error.message)
        setState({ session: d.session ?? null, loading: false })
        return
      }
      setState({ session: data.session, loading: false })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setState((s) => ({ session, loading: s.loading && !session ? s.loading : false })))
    return () => sub.subscription.unsubscribe()
  }, [])
  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
