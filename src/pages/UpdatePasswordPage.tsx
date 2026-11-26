import { useMemo, useState, type FormEvent } from 'react'
import { getTokenPayload, isTokenExpired } from 'pocketbase'
import { errorMessage, pb } from '../lib/pb'
import BrandPanel from '../components/BrandPanel'

/**
 * Opened from the password-reset email (…/?reset=<token>). On success it hands back to the sign-in page.
 * A link that has run out (they last 24 hours) or was already used offers to send a fresh one,
 * so nobody has to go back to the sign-in page and start again.
 */
export default function UpdatePasswordPage({ token, onDone }: { token: string; onDone: (notice: string) => void }) {
  // The link carries its own expiry time and the address it was sent to.
  const linkEmail = useMemo(() => { const e = getTokenPayload(token)?.email; return typeof e === 'string' ? e : '' }, [token])
  const [dead, setDead] = useState(() => isTokenExpired(token))
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState(linkEmail)
  const [msg, setMsg] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const fail = (err: unknown) => {
    const status = (err as { status?: number })?.status
    setMsg(status === 429 ? 'Too many tries from this internet connection. Please try again in 15 minutes.' : errorMessage(err))
  }
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      await pb.collection('users').confirmPasswordReset(token, password, password)
      pb.authStore.clear() // a new password signs every device out
      onDone('Your password has been changed. Sign in with the new one.')
    } catch (err) {
      const status = (err as { status?: number })?.status
      if (status === 400 || /token/i.test(errorMessage(err))) setDead(true)
      else fail(err)
    } finally {
      setBusy(false)
    }
  }
  const sendAgain = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      await pb.collection('users').requestPasswordReset(email.trim())
      setSent(true)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const brand = <div className="mb-3 text-[22px] font-medium text-moss lg:hidden">Sim Family Tree</div>
  const cancel = <button type="button" className="w-full text-[15px] text-ink-mute hover:underline" onClick={() => onDone('')}>Back to sign in</button>
  return (
    <div className="flex h-full items-center justify-center bg-paper p-4">
      <div className="flex w-full max-w-4xl items-center justify-center gap-10">
      <BrandPanel />
      {!dead ? (
        <form onSubmit={save} className="card w-full max-w-sm space-y-4">
          <div>{brand}<h1 className="text-2xl">Choose a new password</h1></div>
          <label className="block"><span className="label">New password</span><input className="input" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></label>
          {msg && <p role="alert" className="text-[15px] text-danger">{msg}</p>}
          <button className="btn-primary w-full justify-center" disabled={busy}>Save password</button>
          {cancel}
        </form>
      ) : sent ? (
        <div className="card w-full max-w-sm space-y-4">
          <div>{brand}<h1 className="text-2xl">Check your email</h1></div>
          <p role="status" className="text-[16px] leading-relaxed text-ink-soft">A new link is on its way to <span className="font-medium text-ink [overflow-wrap:anywhere]">{email.trim()}</span>. It comes from Sim Family Tree and works for 24 hours. If you can’t see it in a few minutes, look in your Junk folder.</p>
          {cancel}
        </div>
      ) : (
        <form onSubmit={sendAgain} className="card w-full max-w-sm space-y-4">
          <div>{brand}<h1 className="text-2xl">This link no longer works</h1></div>
          <p className="text-[16px] leading-relaxed text-ink-soft">Reset links work once, for 24 hours. {linkEmail ? <>We can send a new one to <span className="font-medium text-ink [overflow-wrap:anywhere]">{linkEmail}</span>.</> : 'Enter your email and we’ll send a new one.'}</p>
          {!linkEmail && <label className="block"><span className="label">Email</span><input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>}
          {msg && <p role="alert" className="text-[15px] text-danger">{msg}</p>}
          <button className="btn-primary w-full justify-center" disabled={busy}>Send me a new link</button>
          {cancel}
        </form>
      )}
      </div>
    </div>
  )
}
