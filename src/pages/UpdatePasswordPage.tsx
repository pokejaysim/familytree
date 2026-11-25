import { useState, type FormEvent } from 'react'
import { errorMessage, pb } from '../lib/pb'
import BrandPanel from '../components/BrandPanel'

/** Opened from the password-reset email (…/?reset=<token>). On success it hands back to the sign-in page. */
export default function UpdatePasswordPage({ token, onDone }: { token: string; onDone: (notice: string) => void }) {
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      await pb.collection('users').confirmPasswordReset(token, password, password)
      pb.authStore.clear() // a new password signs every device out
      onDone('Your password has been changed. Sign in with the new one.')
    } catch (err) {
      setMsg(/token/i.test(errorMessage(err)) ? 'That reset link has expired or was already used. Ask for a new one from the sign-in page.' : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex h-full items-center justify-center bg-paper p-4">
      <div className="flex w-full max-w-4xl items-center justify-center gap-10">
      <BrandPanel />
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div><div className="mb-3 text-[22px] font-medium text-moss lg:hidden">Sim Family Tree</div><h1 className="text-2xl">Choose a new password</h1></div>
        <label className="block"><span className="label">New password</span><input className="input" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></label>
        {msg && <p className="text-sm text-danger">{msg}</p>}
        <button className="btn-primary w-full justify-center" disabled={busy}>Save password</button>
        <button type="button" className="w-full text-sm text-ink-mute hover:underline" onClick={() => onDone('')}>Cancel</button>
      </form>
      </div>
    </div>
  )
}
