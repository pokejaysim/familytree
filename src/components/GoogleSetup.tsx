import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '../lib/pb'
import { switchOffGoogle, switchOnGoogle, useGoogleSetup } from '../lib/signin'
import { toast } from '../lib/toast'

/**
 * The Admin page's switch for "Continue with Google" (pocketbase/pb_hooks/google.pb.js).
 * Switching it on takes the two codes from Jason's Google Cloud project. The secret goes
 * straight to the server and is never shown again, so "Replace the codes" asks for both.
 */
export default function GoogleSetup() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useGoogleSetup(true)
  const [editing, setEditing] = useState(false)
  const [clientId, setClientId] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const refresh = () => { qc.invalidateQueries({ queryKey: ['googleSetup'] }); qc.invalidateQueries({ queryKey: ['googleSignIn'] }) }

  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setProblem(null)
    try {
      await switchOnGoogle(clientId, secret)
      setEditing(false); setClientId(''); setSecret(''); refresh()
      toast('saved', 'Google sign-in is on', 'The sign-in page now shows “Continue with Google”.')
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const off = async () => {
    if (!confirm('Switch off Google sign-in? Anyone who joined with Google will need to tap “Forgot password?” to set a password before they can sign in.')) return
    setBusy(true)
    try {
      await switchOffGoogle(); refresh()
      toast('saved', 'Google sign-in is off')
    } catch (err) {
      toast('error', 'Couldn’t switch it off', errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (isLoading) return <p className="card text-ink-mute">Checking…</p>
  if (error || !data) return <p className="card text-[15px] text-danger">Couldn’t check: {error?.message ?? 'no answer'}</p>
  return (
    <div className="card space-y-3 text-[15px] leading-relaxed text-ink-soft">
      {data.on
        ? <p><span className="font-medium text-moss">On.</span> The sign-in page shows “Continue with Google” as well as email and password. Google client ID: <span className="text-ink [overflow-wrap:anywhere]">{data.clientId.slice(0, 16)}…</span></p>
        : <p><span className="font-medium text-ink">Off.</span> Relatives sign in with their email and a password. To switch it on, paste the two codes from your project in <a className="text-brass underline underline-offset-2 hover:text-moss" href="https://console.cloud.google.com/auth/clients" target="_blank" rel="noreferrer">Google Cloud</a> (Google Auth Platform, then Clients).</p>}
      {(editing || !data.on) ? (
        <form onSubmit={save} className="space-y-3">
          <label className="block"><span className="label">Client ID</span><input className="input" required autoComplete="off" spellCheck={false} value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="…apps.googleusercontent.com" /></label>
          <label className="block"><span className="label">Client secret</span><input className="input" type="password" required autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="GOCSPX-…" /></label>
          {problem && <p role="alert" className="text-danger">{problem}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : data.on ? 'Save the new codes' : 'Switch on'}</button>
            {data.on && <button type="button" className="btn-ghost" onClick={() => { setEditing(false); setProblem(null) }}>Cancel</button>}
          </div>
          <p className="text-[14px] text-ink-mute">The secret goes straight to the family tree server and isn’t shown again.</p>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={busy} onClick={() => setEditing(true)}>Replace the codes</button>
          <button className="btn-ghost" disabled={busy} onClick={off}>Switch off</button>
        </div>
      )}
    </div>
  )
}
