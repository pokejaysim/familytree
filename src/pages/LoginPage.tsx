import { useEffect, useState, type FormEvent } from 'react'
import { errorMessage, pb } from '../lib/pb'
import { ADMIN_NAME } from '../config'
import BrandPanel from '../components/BrandPanel'

type Mode = 'signin' | 'signup' | 'reset'
export type Notice = { text: string; ok?: boolean }

/** `notice`: news from an email link (email confirmed, password changed), shown above the form. */
export default function LoginPage({ notice }: { notice?: Notice }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState<Notice | null>(notice ?? null)
  const [offerResend, setOfferResend] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (notice) setMsg(notice) }, [notice])

  const users = pb.collection('users')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null); setOfferResend(false)
    try {
      if (mode === 'signin') await users.authWithPassword(email, password)
      else if (mode === 'signup') {
        await users.create({ email, password, passwordConfirm: password, name, note })
        setMsg({ text: `Almost there. Check your email for a confirmation link. Once ${ADMIN_NAME} approves your account you can sign in and browse.`, ok: true })
      } else {
        await users.requestPasswordReset(email)
        setMsg({ text: 'If that address has an account, a reset link is on its way.', ok: true })
      }
    } catch (err) {
      if (mode === 'signin') {
        // PocketBase doesn't say which part failed: a wrong password and an unconfirmed email look the same.
        setMsg({ text: "That email and password didn't work. If you've just signed up, confirm your email first, using the link we sent you." })
        setOfferResend(true)
      } else setMsg({ text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }
  const resend = async () => {
    setOfferResend(false)
    await users.requestVerification(email).catch(() => undefined)
    setMsg({ text: 'If that address is waiting to be confirmed, a new link is on its way.', ok: true })
  }

  const title = { signin: 'Sign in', signup: 'Create your account', reset: 'Reset your password' }[mode]
  const blurb = {
    signin: 'Welcome back to the family.',
    signup: `Family members can request an account here. ${ADMIN_NAME} approves each one before it can see the tree.`,
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
            {mode === 'signup' && <p className="mt-1 text-[13px] text-ink-mute">At least 8 characters.</p>}
          </div>
        )}
        {msg && <p role="status" className={`text-[15px] ${msg.ok ? 'text-moss' : 'text-danger'}`}>{msg.text}</p>}
        {offerResend && email && <button type="button" className="whitespace-nowrap text-[15px] text-brass underline underline-offset-2 hover:text-moss" onClick={resend}>Send me a new confirmation link</button>}
        <button className="btn-primary w-full justify-center" disabled={busy}>{busy ? 'One moment…' : { signin: 'Sign in', signup: 'Create account', reset: 'Send reset link' }[mode]}</button>
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 text-[15px] text-brass">
          {mode === 'signin' ? (
            <>
              <button type="button" className="whitespace-nowrap underline underline-offset-4 hover:text-moss" onClick={() => { setMode('signup'); setMsg(null); setOfferResend(false) }}>New here? Create an account</button>
              <button type="button" className="whitespace-nowrap underline underline-offset-4 hover:text-moss" onClick={() => { setMode('reset'); setMsg(null); setOfferResend(false) }}>Forgot password?</button>
            </>
          ) : (
            <button type="button" className="hover:underline" onClick={() => { setMode('signin'); setMsg(null) }}>Back to sign in</button>
          )}
        </div>
      </form>
      </div>
    </div>
  )
}
