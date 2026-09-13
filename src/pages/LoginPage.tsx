import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import BrandPanel from '../components/BrandPanel'

type Mode = 'signin' | 'signup' | 'reset'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const redirectTo = window.location.origin + import.meta.env.BASE_URL
    let error: { message: string } | null = null
    if (mode === 'signin') ({ error } = await supabase.auth.signInWithPassword({ email, password }))
    else if (mode === 'signup') ({ error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data: { name, note } } }))
    else ({ error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo }))
    setBusy(false)
    if (error) setMsg({ text: error.message })
    else if (mode === 'signup') setMsg({ text: 'Almost there. Check your email for a confirmation link. Once Jason approves your account you can sign in and browse.', ok: true })
    else if (mode === 'reset') setMsg({ text: 'If that address has an account, a reset link is on its way.', ok: true })
  }

  const title = { signin: 'Sign in', signup: 'Create your account', reset: 'Reset your password' }[mode]
  const blurb = {
    signin: 'Welcome back to the family.',
    signup: 'Family members can request an account here. Jason approves each one before it can see the tree.',
    reset: 'Enter your email and we’ll send a link to choose a new password.',
  }[mode]

  return (
    <div className="flex h-full items-center justify-center bg-paper p-4">
      <div className="flex w-full max-w-4xl items-center justify-center gap-10">
      <BrandPanel />
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <div className="mb-3 text-[22px] font-medium text-moss lg:hidden">Sim Family Tree</div>
          <h1 className="text-2xl">{title}</h1>
          <p className="text-sm text-ink-mute">{blurb}</p>
        </div>
        {mode === 'signup' && <div><label className="label">Your name</label><input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="So relatives know who you are" /></div>}
        {mode === 'signup' && <div><label className="label">How are you related?</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Eng Kiat's daughter" maxLength={140} /></div>}
        <div><label className="label">Email</label><input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        {mode !== 'reset' && (
          <div><label className="label">Password</label><input className="input" type="password" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
            {mode === 'signup' && <p className="mt-1 text-xs text-ink-mute">At least 8 characters.</p>}
          </div>
        )}
        {msg && <p className={`text-sm ${msg.ok ? 'text-moss' : 'text-red-800'}`}>{msg.text}</p>}
        <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'One moment…' : { signin: 'Sign in', signup: 'Create account', reset: 'Send reset link' }[mode]}</button>
        <div className="flex justify-between text-sm text-ink-mute">
          {mode === 'signin' ? (
            <>
              <button type="button" className="hover:underline" onClick={() => { setMode('signup'); setMsg(null) }}>New here? Create an account</button>
              <button type="button" className="hover:underline" onClick={() => { setMode('reset'); setMsg(null) }}>Forgot password?</button>
            </>
          ) : (
            <button type="button" className="hover:underline" onClick={() => { setMode('signin'); setMsg(null) }}>← Back to sign in</button>
          )}
        </div>
      </form>
      </div>
    </div>
  )
}
