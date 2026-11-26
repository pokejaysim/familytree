import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { errorMessage, pb } from '../lib/pb'
import { noteSignIn } from '../lib/splash'
import { ADMIN_NAME } from '../config'
import BrandPanel from '../components/BrandPanel'

type Mode = 'welcome' | 'signin' | 'signup' | 'reset'
export type Notice = { text: string; ok?: boolean }

/** Remembered on each device after a sign-in, so returning members skip the welcome and get the form. */
const SIGNED_IN_BEFORE = 'sft-signed-in-before'
const signedInBefore = () => { try { return !!localStorage.getItem(SIGNED_IN_BEFORE) } catch { return false } }
const rememberSignIn = () => { try { localStorage.setItem(SIGNED_IN_BEFORE, '1') } catch { /* storage unavailable: they'll see the welcome again */ } }

const STEPS = ['Ask to join. It takes a minute.', `${ADMIN_NAME} checks it’s you, usually within a day or two.`, 'You get an email, and you’re in.']

/**
 * What signed-out visitors see. Newcomers get a welcome with two clear choices (ask to join, or sign in)
 * and how joining works. Anyone who has signed in on this device before, arrives from an email link
 * (`?signin`, or a notice such as "password changed"), goes straight to the sign-in form.
 * Asking to join signs you straight in: until an admin approves the account, App shows "You're on the list".
 */
export default function LoginPage({ notice }: { notice?: Notice }) {
  const [params, setParams] = useSearchParams()
  const [mode, setMode] = useState<Mode>(() => (notice || signedInBefore() || params.has('signin') ? 'signin' : 'welcome'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<Notice | null>(notice ?? null)
  const [busy, setBusy] = useState(false)
  const pwId = useId()
  useEffect(() => { if (notice) { setMsg(notice); setMode((m) => (m === 'welcome' ? 'signin' : m)) } }, [notice])
  // The "You're in" email links to ?signin; it has done its job once the form is showing.
  useEffect(() => { if (params.has('signin')) setParams((p) => { p.delete('signin'); return p }, { replace: true }) }, [params, setParams])

  const go = (m: Mode) => { setMode(m); setMsg(null) }
  const users = pb.collection('users')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (mode === 'signin') { await users.authWithPassword(email, password); rememberSignIn(); noteSignIn() }
      else if (mode === 'signup') {
        await users.create({ email, password, passwordConfirm: password, name, note })
        // Straight in: they land on the "You're on the list" page until they're approved.
        try { await users.authWithPassword(email, password); rememberSignIn(); noteSignIn() }
        catch { setMode('signin'); setMsg({ text: 'Your account is ready. Sign in with your email and password.', ok: true }) }
      } else {
        await users.requestPasswordReset(email)
        setMsg({ text: 'If that address has an account, a reset link is on its way.', ok: true })
      }
    } catch (err) {
      const status = (err as { status?: number })?.status
      // Sign-in is limited per few seconds; sign-ups and reset emails per visitor over a longer stretch.
      if (status === 429) setMsg({ text: { welcome: '', signin: 'Too many tries in a row. Wait a few seconds, then try again.', signup: 'Too many sign-ups from this internet connection. Please try again in an hour.', reset: 'Too many reset emails asked for from this internet connection. Please try again in 15 minutes.' }[mode] })
      else if (status === 0) setMsg({ text: errorMessage(err) }) // couldn't reach the server
      else if (mode === 'signin') {
        setMsg({ text: status === 403
          ? `This account can’t sign in right now. Send ${ADMIN_NAME} a message from the Help page.`
          : 'That email and password didn’t work. Check it’s the email you signed up with, or tap Forgot password.' })
      } else if (mode === 'signup' && (err as { response?: { data?: { email?: { code?: string } } } })?.response?.data?.email?.code === 'validation_not_unique') {
        setMsg({ text: 'There’s already an account with that email. Tap Sign in below, or use Forgot password if you can’t remember the password.' })
      } else setMsg({ text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  const link = 'whitespace-nowrap underline underline-offset-4 hover:text-moss'
  const help = <p className="border-t border-line pt-3 text-center text-[15px] text-ink-mute">Stuck? <Link to="/help" className="text-brass underline underline-offset-4 hover:text-moss">Get help or send {ADMIN_NAME} a message</Link></p>
  const brand = <div className="mb-3 text-[22px] font-medium text-moss lg:hidden">Sim Family Tree</div>

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-paper p-4">
      <div className="flex w-full max-w-4xl items-center justify-center gap-10">
      <BrandPanel />
      {mode === 'welcome' ? (
        <section className="card w-full max-w-sm space-y-5">
          <div>
            {brand}
            <h1 className="text-[26px] leading-tight">Welcome to the family tree</h1>
            <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">Bernard’s family book, online, with photos and stories from the whole family. It’s private: only family members {ADMIN_NAME} has approved can see it.</p>
          </div>
          <div className="space-y-2">
            <button className="btn-primary min-h-11 w-full justify-center text-[16px]" onClick={() => go('signup')} autoFocus>I’m new here: ask to join</button>
            <button className="btn-ghost min-h-11 w-full justify-center text-[16px]" onClick={() => go('signin')}>I already have an account</button>
          </div>
          <Steps />
          {help}
        </section>
      ) : (
        <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
          <div>
            {brand}
            <h1 className="text-2xl">{{ signin: 'Sign in', signup: 'Ask to join', reset: 'Reset your password' }[mode]}</h1>
            {mode === 'signin' && <p className="text-[15px] text-ink-mute">Welcome back to the family.</p>}
            {mode === 'reset' && <p className="text-[15px] text-ink-mute">Enter your email and we’ll send a link to choose a new password.</p>}
          </div>
          {mode === 'signup' && <Steps />}
          {mode === 'signup' && <label className="block"><span className="label">Your name</span><input className="input" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="So relatives know who you are" /></label>}
          {mode === 'signup' && <label className="block"><span className="label">How are you related?</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Eng Kiat’s daughter" maxLength={140} /></label>}
          <div>
            <label className="block"><span className="label">Email</span><input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            {mode === 'signup' && <p className="mt-1 text-[14px] text-ink-mute">Use an email you check: that’s where your “You’re in” email goes.</p>}
          </div>
          {mode !== 'reset' && (
            <div>
              <label htmlFor={pwId} className="label">Password</label>
              <div className="relative">
                <input id={pwId} className="input pr-20" type={showPassword ? 'text' : 'password'} required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="absolute inset-y-0 right-0 flex items-center gap-1 px-3 text-[14px] text-ink-mute hover:text-moss" aria-pressed={showPassword} onClick={() => setShowPassword((s) => !s)}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}{showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {mode === 'signup' && <p className="mt-1 text-[14px] text-ink-mute">At least 8 characters. Tap Show to check it before you carry on.</p>}
            </div>
          )}
          {msg && <p role="status" className={`text-[15px] ${msg.ok ? 'text-moss' : 'text-danger'}`}>{msg.text}</p>}
          <button className="btn-primary min-h-11 w-full justify-center text-[16px]" disabled={busy}>{busy ? 'One moment…' : { signin: 'Sign in', signup: 'Ask to join', reset: 'Send reset link' }[mode]}</button>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 text-[15px] text-brass">
            {mode === 'signin' && <>
              <button type="button" className={link} onClick={() => go('signup')}>New here? Ask to join</button>
              <button type="button" className={link} onClick={() => go('reset')}>Forgot password?</button>
            </>}
            {mode === 'signup' && <button type="button" className={link} onClick={() => go('signin')}>Already have an account? Sign in</button>}
            {mode === 'reset' && <button type="button" className={link} onClick={() => go('signin')}>Back to sign in</button>}
          </div>
          {help}
        </form>
      )}
      </div>
    </div>
  )
}

/** How joining works, in three steps (on the welcome and at the top of the sign-up form). */
function Steps() {
  return (
    <div className="rounded-md bg-moss-light/40 px-4 py-3">
      <h2 className="text-[15px] font-medium text-ink">How joining works</h2>
      <ol className="mt-2 space-y-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex gap-3 text-[15px] leading-snug text-ink-soft">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-medium text-moss" aria-hidden="true">{i + 1}</span>
            <span className="pt-0.5"><span className="sr-only">Step {i + 1}: </span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
