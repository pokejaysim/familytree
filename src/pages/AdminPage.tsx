import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, KeyRound, Link2, Mail, Search, X } from 'lucide-react'
import type { ReactNode } from 'react'
import AppHeader from '../components/AppHeader'
import Modal from '../components/Modal'
import PersonPicker from '../components/PersonPicker'
import { ClaimCard, HistoryRow, RequestCard } from '../components/ReviewCards'
import { sendAccountEmail, useIsAdmin, useLinkMember, useMembers, useReviewMember, type MemberRole, type Profile } from '../lib/profile'
import { useRecentHistory, useReviewQueue } from '../lib/changes'
import { usePerson, useTreeData, useTrees } from '../lib/queries'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/pb'
import { fullName } from '../lib/dates'
import { toast } from '../lib/toast'
import type { Person } from '../lib/types'

/**
 * The admin's one page: what's waiting (sign-ups, "this is me" requests, suggested changes),
 * everyone who has an account, and recent changes with undo. /review and /members lead here.
 */
export default function AdminPage() {
  const isAdmin = useIsAdmin()
  const { session } = useAuth()
  const { data: members = [], isLoading, error } = useMembers()
  const { data: queue = [], isLoading: loadingQueue } = useReviewQueue(isAdmin)
  const { data: history = [] } = useRecentHistory(isAdmin)
  const { data: trees } = useTrees()
  const { data: tree } = useTreeData(trees?.[0]?.id ?? '')
  const [q, setQ] = useState('')
  const names = useMemo(() => new Map(members.map((m) => [m.id, m.name || m.email])), [members])
  if (!isAdmin) return <div className="flex h-full flex-col"><AppHeader /><p className="p-6 text-ink-mute">Only admins can see this page.</p></div>

  const joining = members.filter((m) => m.status === 'pending')
  const claims = members.filter((m) => m.status !== 'pending' && m.person_status === 'pending')
  const waiting = joining.length + claims.length + queue.length
  const approved = members.filter((m) => m.status === 'approved').sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
  const declined = members.filter((m) => m.status === 'declined')
  const t = q.toLowerCase().trim()
  const shown = t ? approved.filter((m) => `${m.name ?? ''} ${m.email}`.toLowerCase().includes(t)) : approved
  const linkedElsewhere = (m: Profile) => members.filter((o) => o.id !== m.id && o.person_status === 'approved' && o.person_id).map((o) => o.person_id!)
  const row = (m: Profile) => <MemberRow key={m.id} m={m} isMe={m.id === session?.user.id} people={tree?.people ?? []} taken={linkedElsewhere(m)} />

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-6">
          <div>
            <h1 className="text-[28px] leading-tight">Admin</h1>
            <nav aria-label="Sections" className="mt-3 flex flex-wrap gap-2">
              <Chip to="waiting">Waiting for you{waiting > 0 && <span className="ml-1.5 rounded-full bg-brass-light px-1.5 text-[13px] font-semibold text-moss">{waiting}</span>}</Chip>
              <Chip to="members">Members · {approved.length}</Chip>
              <Chip to="history">Recent changes</Chip>
            </nav>
          </div>
          {error && <p className="text-danger">{error.message}</p>}

          <section id="waiting" className="scroll-mt-4 space-y-4">
            <h2 className="text-[22px]">Waiting for you</h2>
            {!isLoading && !loadingQueue && waiting === 0 && (
              <p className="card text-[15px] text-ink-mute">Nothing is waiting for you. New sign-ups and suggested changes show up here, and you also get an email when someone signs up.</p>
            )}
            {joining.length > 0 && (
              <Group title="Want to join" count={joining.length}>
                {joining.map((m) => <JoinCard key={m.id} m={m} />)}
              </Group>
            )}
            {claims.length > 0 && (
              <Group title="Say they’re someone in the tree" count={claims.length}>
                {claims.map((m) => <ClaimCard key={m.id} profileId={m.id} who={m.name || m.email} note={m.note} personId={m.person_id!} />)}
              </Group>
            )}
            {queue.length > 0 && (
              <Group title="Suggested changes" count={queue.length}>
                {queue.map((r) => <RequestCard key={r.id} r={r} author={names.get(r.author_id) ?? 'A relative'} />)}
              </Group>
            )}
          </section>

          <section id="members" className="scroll-mt-4 space-y-3">
            <div>
              <h2 className="text-[22px]">Members <span className="text-ink-mute">{approved.length}</span></h2>
              <p className="mt-1 text-[15px] text-ink-mute">Contributors can suggest changes, which wait for you above. View-only members can look around but not suggest anything. Admins’ changes apply at once.</p>
            </div>
            {approved.length > 8 && (
              <label className="relative block">
                <span className="sr-only">Find a member</span>
                <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-mute" />
                <input className="input pl-9" placeholder="Find a member by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
            )}
            {isLoading && <p className="text-ink-mute">Loading…</p>}
            {shown.length > 0 && <ul className="divide-y divide-line rounded-lg border border-line bg-white">{shown.map(row)}</ul>}
            {t && shown.length === 0 && <p className="text-[15px] text-ink-mute">No member matches “{q.trim()}”.</p>}
            {declined.length > 0 && (
              <details className="rounded-lg border border-line bg-white">
                <summary className="cursor-pointer px-4 py-3 text-[15px] text-ink-soft">Declined or removed · {declined.length}</summary>
                <ul className="divide-y divide-line border-t border-line">{declined.map(row)}</ul>
              </details>
            )}
          </section>

          <section id="history" className="scroll-mt-4 space-y-3">
            <div>
              <h2 className="text-[22px]">Recent changes</h2>
              <p className="mt-1 text-[15px] text-ink-mute">Anything that was added can be undone here, which puts everything it touched back the way it was.</p>
            </div>
            {history.length === 0
              ? <p className="card text-[15px] text-ink-mute">No changes yet.</p>
              : <ul className="divide-y divide-line rounded-lg border border-line bg-white">{history.map((r) => <HistoryRow key={r.id} r={r} author={names.get(r.author_id) ?? 'A relative'} reviewer={r.reviewed_by ? names.get(r.reviewed_by) : undefined} />)}</ul>}
          </section>
        </div>
      </main>
    </div>
  )
}

function Chip({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a href={`#${to}`} className="flex items-center rounded-full border border-line bg-white px-3 py-1 text-[15px] text-ink-soft transition-colors hover:border-moss hover:bg-moss-light"
      onClick={(e) => { e.preventDefault(); document.getElementById(to)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
      {children}
    </a>
  )
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[17px] font-medium text-ink-soft">{title} <span className="font-normal text-ink-mute">{count}</span></h3>
      {children}
    </div>
  )
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]
const ago = (iso: string) => {
  const s = (Date.parse(iso) - Date.now()) / 1000
  for (const [unit, n] of UNITS) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit)
  return 'just now'
}
/** Visits have been recorded since the Admin page went live. */
const VISITS_FROM = '2026-11-26T02:00:00Z'
const lastHere = (m: Profile) => (m.last_seen ? ago(m.last_seen) : m.created_at > VISITS_FROM ? 'Not yet' : `Not since ${day(VISITS_FROM)}`)

/** Sends one of the account emails, after checking, and says how it went. */
function useSender(m: Profile) {
  const [busy, setBusy] = useState(false)
  const send = async (kind: 'reset' | 'confirm') => {
    const what = kind === 'reset' ? 'a password reset link' : 'a new confirm-your-email link'
    if (!confirm(`Send ${what} to ${m.email}?`)) return
    setBusy(true)
    try {
      await sendAccountEmail(kind, m.email)
      toast('saved', 'Email sent', `It’s on its way to ${m.email}. The link works for 24 hours.`)
    } catch (err) {
      toast('error', 'Couldn’t send the email', (err as { status?: number })?.status === 429 ? 'Too many tries in a row. Wait a few seconds, then try again.' : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return { busy, send }
}

function JoinCard({ m }: { m: Profile }) {
  const review = useReviewMember()
  const sender = useSender(m)
  return (
    <article className="card space-y-3">
      <div>
        <p className="text-[17px] text-ink [overflow-wrap:anywhere]">{m.name || m.email}</p>
        <p className="text-[15px] text-ink-mute [overflow-wrap:anywhere]">{m.email} · signed up {day(m.created_at)}</p>
        {m.note && <p className="mt-1 text-[15px] italic text-ink-soft">“{m.note}”</p>}
        {!m.verified && <p className="mt-1 text-[15px] text-ink-soft">They haven’t confirmed their email yet, so they can’t sign in until they do, even once you approve them.</p>}
      </div>
      {review.error && <p className="text-[15px] text-danger">{review.error.message}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={review.isPending} onClick={() => review.mutate({ id: m.id, status: 'approved', role: 'editor' })}><Check size={15} /> Approve</button>
        <button className="btn-ghost" disabled={review.isPending} onClick={() => review.mutate({ id: m.id, status: 'approved', role: 'viewer' })}>Approve as view only</button>
        <button className="btn-ghost" disabled={review.isPending} onClick={() => { if (confirm(`Decline ${m.name || m.email}? They won’t be able to see the tree.`)) review.mutate({ id: m.id, status: 'declined' }) }}><X size={15} /> Decline</button>
        {!m.verified && <button className="btn-ghost" disabled={sender.busy} onClick={() => sender.send('confirm')}><Mail size={15} /> Resend confirmation email</button>}
      </div>
    </article>
  )
}

const ROLE_NAME: Record<MemberRole, string> = { viewer: 'View only', editor: 'Contributor', admin: 'Admin' }

function MemberRow({ m, isMe, people, taken }: { m: Profile; isMe: boolean; people: Person[]; taken: string[] }) {
  const review = useReviewMember()
  const sender = useSender(m)
  const [linking, setLinking] = useState(false)
  const who = m.name || m.email
  const setRole = (role: MemberRole) => {
    if (role === 'admin' && !confirm(`Make ${who} an admin? They’ll be able to approve members and changes, and their own changes will apply at once.`)) return
    review.mutate({ id: m.id, status: m.status, role })
  }
  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-[17px] text-ink [overflow-wrap:anywhere]">{who}{isMe && <span className="ml-1.5 text-[14px] text-ink-mute">(you)</span>}</p>
          {m.name && <p className="text-[15px] text-ink-mute [overflow-wrap:anywhere]">{m.email}</p>}
        </div>
        {m.status === 'approved' && (
          <label className="shrink-0">
            <span className="sr-only">What {who} can do</span>
            <select className="input w-auto" value={m.role} disabled={isMe || review.isPending} onChange={(e) => setRole(e.target.value as MemberRole)}>
              {(['editor', 'viewer', 'admin'] as const).map((r) => <option key={r} value={r}>{ROLE_NAME[r]}</option>)}
            </select>
          </label>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
        <dt className="text-ink-mute">In the tree</dt>
        <dd className="min-w-0">
          {m.person_id && m.person_status === 'approved' ? <LinkedPerson id={m.person_id} /> : m.person_status === 'pending' ? <span className="text-ink-soft">Asked to be linked, waiting for you above</span> : <span className="text-ink-soft">Not linked yet</span>}
          {m.status === 'approved' && <button className="ml-3 text-brass underline underline-offset-4 hover:text-moss" onClick={() => setLinking(true)}>{m.person_status === 'approved' ? 'Change' : 'Link'}</button>}
        </dd>
        <dt className="text-ink-mute">Last here</dt><dd>{lastHere(m)}</dd>
        <dt className="text-ink-mute">Joined</dt><dd>{day(m.created_at)}</dd>
        {!m.verified && <><dt className="text-ink-mute">Email</dt><dd className="text-ink-soft">Not confirmed yet, so they can’t sign in</dd></>}
      </dl>
      {review.error && <p className="mt-2 text-[15px] text-danger">{review.error.message}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {m.status === 'approved' ? <>
          <button className="btn-ghost" disabled={sender.busy} onClick={() => sender.send('reset')}><KeyRound size={15} /> Send password reset link</button>
          {!m.verified && <button className="btn-ghost" disabled={sender.busy} onClick={() => sender.send('confirm')}><Mail size={15} /> Resend confirmation email</button>}
          {!isMe && <button className="ml-auto text-[15px] text-danger underline underline-offset-4" disabled={review.isPending} onClick={() => { if (confirm(`Remove ${who}’s access? They won’t be able to see the tree. You can let them back in later.`)) review.mutate({ id: m.id, status: 'declined' }) }}>Remove access</button>}
        </> : (
          <button className="btn-ghost" disabled={review.isPending} onClick={() => review.mutate({ id: m.id, status: 'approved', role: 'editor' })}><Check size={15} /> Let them back in</button>
        )}
      </div>
      {linking && <LinkModal m={m} people={people} taken={taken} onClose={() => setLinking(false)} />}
    </li>
  )
}

function LinkedPerson({ id }: { id: string }) {
  const { data: p } = usePerson(id)
  return p ? <Link to={`/trees/${p.tree_id}/people/${p.id}`} className="text-moss underline underline-offset-4">{fullName(p)}</Link> : <span className="text-ink-mute">…</span>
}

function LinkModal({ m, people, taken, onClose }: { m: Profile; people: Person[]; taken: string[]; onClose: () => void }) {
  const link = useLinkMember()
  const who = m.name || m.email
  const pick = async (person: string | null) => {
    try {
      await link.mutateAsync({ user: m.id, person })
      toast('saved', person ? `${who} is linked` : 'Link removed')
      onClose()
    } catch { /* shown below */ }
  }
  return (
    <Modal title={`Who is ${who} in the tree?`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[15px] text-ink-mute"><Link2 size={15} className="mr-1 inline align-[-2px]" />Linking shows them as “You” on the map and lets them see how they’re related to everyone. People already linked to another member aren’t listed.</p>
        <PersonPicker people={people} exclude={taken} placeholder="Type a name" onPick={(p) => pick(p.id)} />
        {link.error && <p className="text-[15px] text-danger">{link.error.message}</p>}
        {m.person_status === 'approved' && <button className="text-[15px] text-danger underline underline-offset-4" disabled={link.isPending} onClick={() => pick(null)}>Remove the link</button>}
      </div>
    </Modal>
  )
}
