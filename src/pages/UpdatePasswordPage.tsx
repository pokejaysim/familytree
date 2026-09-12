import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/** Shown after a password-reset link is followed (Supabase signs the user in with a recovery session). */
export default function UpdatePasswordPage() {
  const nav = useNavigate()
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setMsg(error.message); else nav('/', { replace: true })
  }
  return (
    <div className="flex h-full items-center justify-center bg-paper p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div><div className="mb-3 text-[22px] font-medium text-moss">Sim Family Tree</div><h1 className="text-2xl">Choose a new password</h1></div>
        <div><label className="label">New password</label><input className="input" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></div>
        {msg && <p className="text-sm text-red-800">{msg}</p>}
        <button className="btn-primary w-full justify-center" disabled={busy}>Save password</button>
      </form>
    </div>
  )
}
