import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, CheckCircle2, Copy, KeyRound, Link2, Mail, RefreshCw, Search, X } from 'lucide-react'
import type { ReactNode } from 'react'
import AppHeader from '../components/AppHeader'
import Modal from '../components/Modal'
import PersonPicker from '../components/PersonPicker'
import TreeSettingsForm from '../components/TreeSettingsForm'
import GoogleSetup from '../components/GoogleSetup'
import { ClaimCard, HistoryRow, RequestCard } from '../components/ReviewCards'
import { sendResetLink, useIsAdmin, useLinkMember, useMembers, useReviewMember, type MemberRole, type Profile } from '../lib/profile'
import { useRecentHistory, useReviewQueue } from '../lib/changes'
import { usePerson, useTreeData, useTrees } from '../lib/queries'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/pb'
import { fullName } from '../lib/dates'
import { toast } from '../lib/toast'
import { sendTestEmail, useSiteHealth, type SiteHealth } from '../lib/health'
import type { Person } from '../lib/types'

/**
 * The admin's one page: what's waiting (sign-ups, "this is me" requests, suggested changes),
 * everyone who has an account, recent changes with undo, the site's health (backups, space, email)
 * and the tree's own settings (name, description, foreword, introduction). /review and /members lead here.
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
              <Chip to="health">Site health</Chip>
              <Chip to="google">Google sign-in</Chip>
              <Chip to="tree">Tree settings</Chip>
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
                {claims.map((m) => {
                  const other = members.find((o) => o.id !== m.id && o.person_status === 'approved' && o.person_id === m.person_id)
                  return <ClaimCard key={m.id} profileId={m.id} who={m.name || m.email} personId={m.person_id!} clash={other ? other.name || other.email : undefined} />
                })}
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
            {approved.length > 0 && <EmailList members={approved} />}
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

          <section id="health" className="scroll-mt-4 space-y-3">
            <div>
              <h2 className="text-[22px]">Site health</h2>
              <p className="mt-1 text-[15px] text-ink-mute">A quick look at the home server: backups, space and email.</p>
            </div>
            <HealthPanel />
          </section>

          <section id="google" className="scroll-mt-4 space-y-3">
            <div>
              <h2 className="text-[22px]">Sign in with Google</h2>
              <p className="mt-1 text-[15px] text-ink-mute">Lets relatives join and sign in with their Google account instead of a password. New accounts still wait for you to approve them.</p>
            </div>
            <GoogleSetup />
          </section>

          {trees?.[0] && (
            <section id="tree" className="scroll-mt-4 space-y-3">
              <div>
                <h2 className="text-[22px]">Tree settings</h2>
                <p className="mt-1 text-[15px] text-ink-mute">The name and words everyone sees on the home page and when they open the foreword. Changes show for everyone as soon as you save.</p>
              </div>
              <div className="card"><TreeSettingsForm key={trees[0].id} tree={trees[0]} /></div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

/**
 * "Copy email list": every approved member's name and address, ready to paste into Gmail's Bcc box so
 * nobody sees anyone else's address. Leaves out anyone who switched off the family news emails. If the
 * browser won't copy, the list is shown so it can be selected by hand.
 */
function EmailList({ members }: { members: Profile[] }) {
  const [shown, setShown] = useState<string | null>(null)
  const list = members.filter((m) => m.email && !m.news_emails_off)
  const left = members.length - list.length
  const text = list.map((m) => {
    const name = (m.name ?? '').replace(/["<>\\]/g, '').trim()
    return name ? `"${name}" <${m.email}>` : m.email
  }).join(', ')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setShown(null)
      toast('saved', `Copied ${list.length} ${list.length === 1 ? 'address' : 'addresses'}`, 'Paste them into the Bcc box in Gmail, so nobody sees anyone else’s address.')
    } catch {
      setShown(text)
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button className="btn-ghost" onClick={copy} disabled={list.length === 0}><Copy size={16} /> Copy email list</button>
        <span className="text-[14px] text-ink-mute">
          {list.length} {list.length === 1 ? 'member' : 'members'}
          {left > 0 && `, leaving out ${left} who turned off the news emails`}. Paste into Bcc.
        </span>
      </div>
      {shown && (
        <label className="block">
          <span className="label">Your browser didn’t let us copy, so select this and copy it yourself</span>
          <textarea className="input min-h-24" readOnly value={shown} onFocus={(e) => e.currentTarget.select()} />
        </label>
      )}
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

/** Sends a member a password reset link, after checking, and says how it went. */
function useSender(m: Profile) {
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if (!confirm(`Send a password reset link to ${m.email}?`)) return
    setBusy(true)
    try {
      await sendResetLink(m.email)
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
  const who = m.name || m.email
  // Approving emails them a "You're in" note with a link (pb_hooks/accounts.pb.js).
  const approve = (role: MemberRole) => review.mutate({ id: m.id, status: 'approved', role }, { onSuccess: () => toast('saved', `${who} is in`, `They’ll get an email at ${m.email} to say so.`) })
  return (
    <article className="card space-y-3">
      <div>
        <p className="text-[17px] text-ink [overflow-wrap:anywhere]">{m.name || m.email}</p>
        <p className="text-[15px] text-ink-mute [overflow-wrap:anywhere]">{m.email} · signed up {day(m.created_at)}</p>
      </div>
      {review.error && <p className="text-[15px] text-danger">{review.error.message}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={review.isPending} onClick={() => approve('editor')}><Check size={15} /> Approve</button>
        <button className="btn-ghost" disabled={review.isPending} onClick={() => approve('viewer')}>Approve as view only</button>
        <button className="btn-ghost" disabled={review.isPending} onClick={() => { if (confirm(`Decline ${m.name || m.email}? They won’t be able to see the tree.`)) review.mutate({ id: m.id, status: 'declined' }) }}><X size={15} /> Decline</button>
      </div>
      <p className="text-[14px] text-ink-mute">Check the email address before approving, because that’s where their “You’re in” email and any password reset links go.</p>
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
      </dl>
      {review.error && <p className="mt-2 text-[15px] text-danger">{review.error.message}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {m.status === 'approved' ? <>
          <button className="btn-ghost" disabled={sender.busy} onClick={sender.send}><KeyRound size={15} /> Send password reset link</button>
          {!isMe && <button className="ml-auto text-[15px] text-danger underline underline-offset-4" disabled={review.isPending} onClick={() => { if (confirm(`Remove ${who}’s access? They won’t be able to see the tree. You can let them back in later.`)) review.mutate({ id: m.id, status: 'declined' }) }}>Remove access</button>}
        </> : (
          <button className="btn-ghost" disabled={review.isPending} onClick={() => review.mutate({ id: m.id, status: 'approved', role: 'editor' }, { onSuccess: () => toast('saved', `${who} is back in`, `They’ll get an email at ${m.email} to say so.`) })}><Check size={15} /> Let them back in</button>
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

const size = (n: number) => {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1000 && i < units.length - 1) { n /= 1000; i++ }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`
}
const moment = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const PROBLEMS: [RegExp, string][] = [[/admins about a sign-up/, 'The email telling you about a sign-up'], [/you're-in/, 'A “You’re in” email to someone you approved'], [/confirmation|verification/i, 'A confirm-your-email message'], [/password reset/i, 'A password reset email'], [/test email/, 'A test email'], [/Help page message/, 'A message from the Help page'], [/family news/, 'A family news email']]
const problemText = (m: string) => PROBLEMS.find(([re]) => re.test(m))?.[1] ?? 'An email'
/** Backups run nightly; one older than this means a night was missed. */
const STALE_HOURS = 36

function HealthPanel() {
  const isAdmin = useIsAdmin()
  const { data: h, isLoading, error, refetch, isFetching } = useSiteHealth(isAdmin)
  if (isLoading) return <p className="text-ink-mute">Checking…</p>
  if (error || !h) return <p className="card text-[15px] text-danger">Couldn’t check the server: {error?.message ?? 'no answer'}</p>
  return (
    <div className="card divide-y divide-line py-1">
      <Backups h={h} />
      <Space h={h} />
      <Email h={h} />
      <Row ok title="In the tree">
        <p>{h.totals.people} people, {h.totals.media} photos and files, {h.totals.sources} {h.totals.sources === 1 ? 'source' : 'sources'}, {h.totals.members} {h.totals.members === 1 ? 'member' : 'members'}.</p>
      </Row>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-[15px] text-ink-mute">
        <span>Checked {ago(h.checkedAt)}</span>
        <button className="btn-ghost" disabled={isFetching} onClick={() => refetch()}><RefreshCw size={15} className={isFetching ? 'motion-safe:animate-spin' : ''} /> Check again</button>
      </div>
    </div>
  )
}

function Row({ ok, title, children }: { ok: boolean; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-3">
      {ok ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-moss" aria-label="All good" /> : <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger" aria-label="Needs a look" />}
      <div className="min-w-0 flex-1 space-y-1 text-[15px] leading-relaxed text-ink-soft">
        <h3 className="text-[17px] text-ink">{title}</h3>
        {children}
      </div>
    </div>
  )
}

function Backups({ h }: { h: SiteHealth }) {
  const { snapshot: s, snapshotLastRunFailed: failed, builtIn: b } = h.backups
  const hours = s?.at ? (Date.now() - Date.parse(s.at)) / 3600000 : Infinity
  const ok = !!s?.at && hours < STALE_HOURS && !failed
  return (
    <Row ok={ok} title="Backups">
      {!s ? <p>Couldn’t read the backup drive. It may be unplugged or not switched on.</p>
        : !s.at ? <p>There are no backups on the backup drive yet.</p>
        : <p>The last backup was made {ago(s.at)} ({moment(s.at)}) and is {size(s.bytes)}. A new one is made every night at 4:30 am, and the backup drive holds the last 30 ({s.count} there now).</p>}
      {s?.at && hours >= STALE_HOURS && <p className="text-danger">That’s more than a day and a half ago, so a night has been missed. Something may be wrong with the nightly backup.</p>}
      {failed && <p className="text-danger">The last nightly backup didn’t finish. The server’s notes will say why.</p>}
      {b?.at && <p>The server also keeps its own copy, made {ago(b.at)}, on the same drive as the site ({b.keep} kept).</p>}
    </Row>
  )
}

function Space({ h }: { h: SiteHealth }) {
  const { used, site, backup } = h.storage
  const ok = !!site && site.free > 1e9 && (!backup || backup.free > 5e9)
  return (
    <Row ok={ok} title="Space">
      <p>
        {used ? `The family tree takes up ${size(used)}. ` : ''}
        {site ? `The site’s drive has ${size(site.free)} free` : 'Couldn’t check the site’s drive'}
        {backup ? `, and the backup drive has ${size(backup.free)} free of ${size(backup.total)}.` : '. Couldn’t check the backup drive.'}
      </p>
      {!ok && site && backup && <p className="text-danger">One of the drives is nearly full. Old backups or files may need clearing out.</p>}
    </Row>
  )
}

function Email({ h }: { h: SiteHealth }) {
  const [busy, setBusy] = useState(false)
  const { ready, from, problems } = h.email
  const test = async () => {
    setBusy(true)
    try {
      const r = await sendTestEmail()
      toast('saved', 'Test email sent', `Look for it at ${r.to} in a minute or two, and check Junk if it isn’t there.`)
    } catch (err) {
      toast('error', 'The test email didn’t send', errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Row ok={ready && problems.length === 0} title="Email">
      {!ready ? <p>Email isn’t set up, so nobody gets “You’re in” emails or password reset links, and you don’t hear about sign-ups.</p>
        : <p>Emails come from {from}. {problems.length === 0 ? 'None failed to send in the last 30 days.' : `${problems.length} failed to send in the last 30 days:`}</p>}
      {problems.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5">
          {problems.map((p, i) => <li key={i}>{problemText(p.message)}, {moment(p.at)}</li>)}
        </ul>
      )}
      {ready && <button className="btn-ghost mt-2" disabled={busy} onClick={test}><Mail size={15} /> Send me a test email</button>}
    </Row>
  )
}
