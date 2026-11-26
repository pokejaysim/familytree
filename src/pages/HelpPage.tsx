import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Send } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../lib/auth'
import { useProfile } from '../lib/profile'
import { call, errorMessage, pb } from '../lib/pb'
import { replayWelcome } from '../lib/welcome'
import { ADMIN_NAME } from '../config'

/**
 * Answers to common questions, and a message form that emails the admins (POST /api/sft/contact).
 * Open to everyone, signed in or not (App.tsx lets /help through), because people who can't
 * sign in are the ones who need it most. Written in Jason's voice, like the Contribute page.
 */
export default function HelpPage() {
  const { session } = useAuth()
  const { data: profile } = useProfile()
  const member = profile?.status === 'approved'

  const faqs: { q: string; a: ReactNode }[] = [
    { q: 'I forgot my password', a: <>On the sign-in page, tap <b className="font-medium">Forgot password?</b> and enter the email you signed up with. You’ll get an email from Sim Family Tree with a link to choose a new password. The link works for 24 hours. If it doesn’t arrive within a few minutes, look in your Junk or Spam folder.</> },
    { q: 'Can I sign in with Google?', a: <>Yes. If you have a Google account (a Gmail address, for example), tap <b className="font-medium">Continue with Google</b> on the sign-in page, whether you’re new or already have an account. If you first joined with a password and the same email address, Google takes you into that same account, and from then on you sign in with Google. You can still set a password at any time with <b className="font-medium">Forgot password?</b></> },
    { q: 'I signed up but can’t get in yet', a: <>I look at every new account myself, usually within a day or two, because the tree has details about living relatives. Until then you’ll see a “You’re on the list” page. As soon as you’re in, you’ll get an email from Sim Family Tree (look in Junk if it doesn’t arrive) and the site lets you in by itself. If it’s been a few days, send me a message below.</> },
    { q: 'How do I find someone?', a: <>Use <b className="font-medium">Find a relative</b> on the home page or the map and type part of their name. If you prefer a list, it’s under <b className="font-medium">People</b>, grouped by branch of the family.</> },
    { q: 'How do I show which person I am?', a: <>Find yourself in the tree, open your page and tap <b className="font-medium">This is me</b> under your name. Once I’ve confirmed it, the map starts from you and every page says how that person is related to you.</> },
    { q: 'How do I add a photo, a date or a story?', a: <>Open the person’s page. Tap <b className="font-medium">Suggest an edit</b> to fix a name or a date or to add memories, the camera for their portrait, or <b className="font-medium">Upload</b> for more photos and documents. There’s more on the <Link className="text-brass underline underline-offset-2" to="/contribute">How to contribute</Link> page.</> },
    { q: 'I’ve spotted a mistake', a: <>Thank you! Open that person’s page, tap <b className="font-medium">Suggest an edit</b> and put in what’s right. If you can, say where it comes from, like a certificate or a family story. If you can’t edit, send me a message below.</> },
    { q: 'My change hasn’t shown up yet', a: <>I look over every change before it goes into the tree. Until then it shows on the person’s page as waiting, and in your list on the How to contribute page, where you can take it back if you change your mind.</> },
    { q: 'Who can see the family tree?', a: <>Only family members I’ve approved, once they’ve signed in. Nobody else can see names, dates, photos or stories.</> },
  ]

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="min-h-0 flex-1 overflow-auto">
        <article className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
          <h1 className="text-3xl leading-tight sm:text-4xl">Help</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-ink-soft">Answers to the questions people ask most. If you’re still stuck, <a href="#message" className="text-brass underline underline-offset-4 hover:text-moss">send me a message</a> at the bottom of the page.</p>
          {!session && <p className="mt-3 text-[16px]"><Link to="/" className="text-brass underline underline-offset-4 hover:text-moss">Back to sign in</Link></p>}

          <ul className="mt-8 divide-y divide-line rounded-lg border border-line bg-white">
            {faqs.map((f) => (
              <li key={f.q}>
                <details className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-[17px] text-ink [&::-webkit-details-marker]:hidden">
                    <span className="flex-1">{f.q}</span>
                    <ChevronDown size={18} className="shrink-0 text-ink-mute transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="px-4 pb-4 text-[16px] leading-relaxed text-ink-soft">{f.a}</p>
                </details>
              </li>
            ))}
          </ul>
          {member && <p className="mt-4 text-[16px]"><button className="text-brass underline underline-offset-4 hover:text-moss" onClick={replayWelcome}>Watch the welcome again</button></p>}

          <ContactForm initialName={profile?.name ?? ''} initialEmail={profile?.email ?? session?.user.email ?? ''} />
        </article>
      </main>
    </div>
  )
}

function ContactForm({ initialName, initialEmail }: { initialName: string; initialEmail: string }) {
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(initialEmail)
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // hidden; only robots fill it in
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const send = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      await call(pb.send('/api/sft/contact', { method: 'POST', body: { name, email, message, website } }))
      setSentTo(email.trim()); setMessage('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="message" className="mt-12 scroll-mt-4">
      <h2 className="text-[24px] leading-tight">Send {ADMIN_NAME} a message</h2>
      <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">It comes straight to my email, and I’ll reply to the address you give here.</p>
      {sentTo ? (
        <div role="status" className="card mt-5 space-y-3">
          <p className="text-[17px] text-moss">Thanks, your message is on its way.</p>
          <p className="text-[16px] text-ink-soft">I’ll reply to <span className="font-medium text-ink [overflow-wrap:anywhere]">{sentTo}</span>, usually within a day or two.</p>
          <button className="text-[15px] text-brass underline underline-offset-4 hover:text-moss" onClick={() => setSentTo(null)}>Send another message</button>
        </div>
      ) : (
        <form onSubmit={send} className="card mt-5 space-y-4">
          <label className="block"><span className="label">Your name</span><input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} /></label>
          <label className="block"><span className="label">Your email</span><input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="block"><span className="label">Your message</span><textarea className="input min-h-36" required minLength={5} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What do you need help with?" /></label>
          {/* Spam trap: hidden from people and screen readers. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-px w-px opacity-0" value={website} onChange={(e) => setWebsite(e.target.value)} />
          {error && <p role="alert" className="text-[15px] text-danger">{error}</p>}
          <button className="btn-primary" disabled={busy}><Send size={16} /> {busy ? 'Sending…' : 'Send message'}</button>
        </form>
      )}
    </section>
  )
}
