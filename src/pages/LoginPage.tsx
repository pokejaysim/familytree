import { Link } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import { errorMessage, pb } from '../lib/pb'
import { noteSignIn } from '../lib/splash'
import { ADMIN_NAME } from '../config'
import BrandPanel from '../components/BrandPanel'

type Mode = 'signin' | 'signup' | 'reset'
export type Notice = { text: string; ok?: boolean }

/**
 * Sign in, sign up, or ask for a reset link. Signing up signs you straight in: until an admin approves the
 * account, App shows the "You're on the list" page (there's no confirm-your-email step).
 * `notice`: news from an email link (password changed, or an older confirm link), shown above the form.
 */
export default function LoginPage({ notice }: { notice?: Notice }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<Notice | null>(notice ?? null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (notice) setMsg(notice) }, [notice])

  const users = pb.collection('users')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (mode === 'signin') { await users.authWithPassword(email, password); noteSignIn() }
      else if (mode === 'signup') {
        await users.create({ email, password, passwordConfirm: password, name, note })
        // Straight in: they land on the "You're on the list" page until they're approved.
        try { await users.authWithPassword(email, password); noteSignIn() }
        catch { setMode('signin'); setMsg({ text: 'Your account is ready. Sign in with your email and password.', ok: true }) }
      } else {
        await users.requestPasswordReset(email)
        setMsg({ text: 'If that address has an account, a reset link is on its way.', ok: true })
      }
    } catch (err) {
      const status = (err as { status?: number })?.status
      // Sign-in is limited per few seconds; sign-ups and reset emails per visitor over a longer stretch.
      if (status === 429) setMsg({ text: { signin: 'Too many tries in a row. Wait a few seconds, then try again.', signup: 'Too many sign-ups from this internet connection. Please try again in an hour.', reset: 'Too many reset emails asked for from this internet connection. Please try again in 15 minutes.' }[mode] })
      else if (status === 0) setMsg({ text: errorMessage(err) }) // couldn't reach the server
      else if (mode === 'signin') {
        setMsg({ text: status === 403
          ? `This account can’t sign in right now. Send ${ADMIN_NAME} a message from the Help page.`
          : 'That email and password didn’t work. Check it’s the email you signed up with, or tap Forgot password.' })
      } else if (mode === 'signup' && (err as { response?: { data?: { email?: { code?: string } } } })?.response?.data?.email?.code === 'validation_not_unique') {
        setMsg({ text: 'There’s already an account with that email. Tap Back to sign in, or use Forgot password if you can’t remember the password.' })
      } else setMsg({ text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const title = { signin: 'Sign in', signup: 'Create your account', reset: 'Reset your password' }[mode]
  const blurb = {
    signin: 'Welcome back to the family.',
    signup: `Family members can ask for an account here. ${ADMIN_NAME} approves each one before it can see the tree, and you’ll get an email when you’re in.`,
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
        {mode === 'signup' && <label className="block"><span className="label">Your name</span><input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="So relatives know who you are" /></label>}
        {mode === 'signup' && <label className="block"><span className="label">How are you related?</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Eng Kiat’s daughter" maxLength={140} /></label>}
        <label className="block"><span className="label">Email</span><input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        {mode !== 'reset' && (
          <div><label className="block"><span className="label">Password</span><input className="input" type="password" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            {mode === 'signup' && <p className="mt-1 text-[13px] text-ink-mute">At least 8 characters.</p>}
          </div>
        )}
        {msg && <p role="status" className={`text-[15px] ${msg.ok ? 'text-moss' : 'text-danger'}`}>{msg.text}</p>}
        <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'One moment…' : { signin: 'Sign in', signup: 'Create account', reset: 'Send reset link' }[mode]}</button>
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 text-[15px] text-brass">
          {mode === 'signin' ? (
            <>
              <button type="button" className="whitespace-nowrap underline underline-offset-4 hover:text-moss" onClick={() => { setMode('signup'); setMsg(null) }}>New here? Create an account</button>
              <button type="button" className="whitespace-nowrap underline underline-offset-4 hover:text-moss" onClick={() => { setMode('reset'); setMsg(null) }}>Forgot password?</button>
            </>
          ) : (
            <button type="button" className="hover:underline" onClick={() => { setMode('signin'); setMsg(null) }}>Back to sign in</button>
          )}
        </div>
        <p className="border-t border-line pt-3 text-center text-[15px] text-ink-mute">Stuck? <Link to="/help" className="text-brass underline underline-offset-4 hover:text-moss">Get help or send Jason a message</Link></p>
      </form>
      </div>
    </div>
  )
}
