import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, RotateCcw, X } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { useIsAdmin, useMembers } from '../lib/profile'
import { useRecentHistory, useReviewClaim, useReviewQueue, useReviewRequest, useRevertRequest, type Change, type ChangeRequest } from '../lib/changes'
import { usePerson, useSignedUrl, useTreeData } from '../lib/queries'
import { fullName } from '../lib/dates'
import { CONFIDENCE_LABELS, type Person } from '../lib/types'

/** Admin's review desk: suggested changes waiting for approval, "this is me" links, and recent history with undo. */
export default function ReviewPage() {
  const isAdmin = useIsAdmin()
  const { data: queue = [], isLoading } = useReviewQueue(isAdmin)
  const { data: history = [] } = useRecentHistory(isAdmin)
  const { data: members = [] } = useMembers()
  const claims = members.filter((m) => m.person_status === 'pending')
  const names = useMemo(() => new Map(members.map((m) => [m.id, m.name || m.email])), [members])
  if (!isAdmin) return <div className="flex h-full flex-col"><AppHeader /><p className="p-6 text-ink-mute">Only admins can review changes.</p></div>
  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
          <div>
            <h1 className="text-2xl">Review</h1>
            <p className="text-sm text-ink-mute">Changes relatives suggest wait here until you approve them. Anything approved can be undone from Recent changes below.</p>
          </div>

          <section className="space-y-3">
            <h2 className="text-xl">Waiting for review <span className="text-ink-mute">{queue.length}</span></h2>
            {isLoading && <p className="text-ink-mute">Loading…</p>}
            {!isLoading && queue.length === 0 && <p className="card text-sm text-ink-mute">Nothing waiting. New suggestions will appear here.</p>}
            {queue.map((r) => <RequestCard key={r.id} r={r} author={names.get(r.author_id) ?? 'A relative'} />)}
          </section>

          {claims.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl">"This is me" requests <span className="text-ink-mute">{claims.length}</span></h2>
              {claims.map((m) => <ClaimCard key={m.id} profileId={m.id} who={m.name || m.email} note={m.note} personId={m.person_id!} />)}
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-xl">Recent changes</h2>
            {history.length === 0 && <p className="card text-sm text-ink-mute">No changes yet.</p>}
            <ul className="card divide-y divide-line p-0">
              {history.map((r) => <HistoryRow key={r.id} r={r} author={names.get(r.author_id) ?? 'A relative'} reviewer={r.reviewed_by ? names.get(r.reviewed_by) : undefined} />)}
            </ul>
          </section>
        </div>
      </main>
    </div>
  )
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')

function RequestCard({ r, author }: { r: ChangeRequest; author: string }) {
  const review = useReviewRequest()
  const { data } = useTreeData(r.tree_id)
  const people = useMemo(() => {
    const m = new Map<string, Person>((data?.people ?? []).map((p) => [p.id, p]))
    for (const c of r.changes) if (c.table === 'people' && c.op === 'insert' && c.data) m.set(String(c.data.id), c.data as unknown as Person) // people this request creates
    return m
  }, [data, r.changes])
  const families = useMemo(() => {
    const m = new Map<string, { partner1_id?: unknown; partner2_id?: unknown }>((data?.families ?? []).map((f) => [f.id, f]))
    for (const c of r.changes) if (c.table === 'families' && c.op === 'insert' && c.data) m.set(String(c.data.id), c.data)
    return m
  }, [data, r.changes])
  const nameOf = (id: unknown) => { const p = people.get(String(id)); return p ? fullName(p) : 'someone' }
  // A family is named by its parents; one with no parents recorded yet is named by its children instead.
  const familyOf = (id: unknown) => {
    const f = families.get(String(id))
    const parents = f ? [f.partner1_id, f.partner2_id].filter(Boolean).map(nameOf) : []
    if (parents.length) return parents.join(' and ')
    const kids = (data?.children ?? []).filter((c) => c.family_id === String(id)).map((c) => nameOf(c.person_id))
    return kids.length ? `the family of ${listOf(kids)}` : 'a new family'
  }
  return (
    <article className="card space-y-3">
      <div>
        <p className="text-[17px] text-ink">{r.summary}</p>
        <p className="text-sm text-ink-mute">Suggested by {author} · {when(r.created_at)}{r.subject_person_id && data?.people.some((p) => p.id === r.subject_person_id) ? <> · <Link className="text-brass underline underline-offset-2" to={`/trees/${r.tree_id}/people/${r.subject_person_id}`}>open profile</Link></> : null}</p>
      </div>
      <ul className="space-y-2 rounded-md border border-line bg-paper p-3 text-sm">
        {r.changes.map((c, i) => <ChangeLine key={i} c={c} nameOf={nameOf} familyOf={familyOf} />)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={review.isPending} onClick={() => review.mutate({ id: r.id, approve: true })}><Check size={14} /> Approve</button>
        <button className="btn-ghost" disabled={review.isPending} onClick={() => { const note = prompt('Decline this change? You can add a short note for them (optional).'); if (note !== null) review.mutate({ id: r.id, approve: false, note: note || undefined }) }}><X size={14} /> Decline</button>
      </div>
    </article>
  )
}

const LABELS: Record<string, string> = {
  given_names: 'Given names', surname: 'Surname', maiden_name: 'Maiden name', nickname: 'Nickname', sex: 'Sex', birth_date: 'Born', birth_place: 'Birthplace',
  death_date: 'Died', death_place: 'Place of death', is_living: 'Living', bio: 'Biography', photo_path: 'Profile photo', type: 'Type', date_text: 'Date', place: 'Place',
  description: 'Description', page: 'Page', quote: 'Quote', confidence: 'Confidence', title: 'Title', author: 'Author', publication: 'Publication', repository: 'Repository',
  url: 'Link', notes: 'Notes', caption: 'Caption', start_date: 'Married', start_place: 'Where', union_type: 'Kind of union', relation: 'Relation',
}
const HIDDEN = new Set(['id', 'tree_id', 'created_at', 'updated_at', 'birth_date_sort', 'death_date_sort', 'date_sort', 'start_date_sort', 'end_date_sort', 'person_id', 'family_id', 'source_id', 'event_id', 'storage_path', 'mime_type', 'partner1_id', 'partner2_id'])
const SEX: Record<string, string> = { M: 'Male', F: 'Female', X: 'Other', U: 'Unknown' }
const ORDER = ['given_names', 'surname', 'maiden_name', 'nickname', 'sex', 'birth_date', 'birth_place', 'is_living', 'death_date', 'death_place', 'bio', 'type', 'date_text', 'place', 'description', 'title', 'author', 'publication', 'repository', 'url', 'page', 'quote', 'confidence', 'caption', 'notes']
const rank = (k: string) => { const i = ORDER.indexOf(k); return i < 0 ? 99 : i }
const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const show = (v: unknown, k?: string) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : k === 'sex' ? SEX[String(v)] ?? String(v) : k === 'confidence' ? CONFIDENCE_LABELS[Number(v)] ?? String(v) : String(v))

function ChangeLine({ c, nameOf, familyOf }: { c: Change; nameOf: (id: unknown) => string; familyOf: (id: unknown) => string }) {
  const d = c.data ?? {}, b = c.before ?? {}
  const fields = (obj: Record<string, unknown>) => Object.entries(obj).filter(([k, v]) => !HIDDEN.has(k) && v !== null && v !== '' && v !== undefined && !(k === 'sex' && v === 'U') && !(k === 'is_living' && v === false))
  let head: string
  switch (c.table) {
    case 'people': head = c.op === 'insert' ? `New person: ${nameOf(d.id)}` : c.op === 'update' ? `Change ${nameOf(c.key?.id)}` : `Remove ${nameOf(c.key?.id)} (and their events, photos and family links)`; break
    case 'families': {
      const newParent = d.partner1_id ?? d.partner2_id
      head = c.op === 'insert' ? (newParent ? `New family with ${[d.partner1_id, d.partner2_id].filter(Boolean).map(nameOf).join(' and ')} as parents` : 'New family (parents not named yet)')
        : c.op === 'update' ? (newParent ? `Make ${nameOf(newParent)} a parent in ${familyOf(c.key?.id)}` : `Change ${familyOf(c.key?.id)}`)
        : `Remove ${familyOf(c.key?.id)}`
      break
    }
    case 'family_children': { const k = c.op === 'insert' ? d : c.key ?? {}; { const fam = familyOf(k.family_id); head = `${c.op === 'insert' ? 'Add' : 'Remove'} ${nameOf(k.person_id)} as a child ${fam.startsWith('the family') || fam === 'a new family' ? `in ${fam}` : `of ${fam}`}` }; break }
    case 'events': head = c.op === 'insert' ? `New life event for ${nameOf(d.person_id)}` : c.op === 'delete' ? `Remove the ${show(b.type)} event (${show(b.date_text)}) from ${nameOf(b.person_id)}` : 'Change a life event'; break
    case 'citations': head = c.op === 'insert' ? `New citation for ${nameOf(d.person_id)}` : `Remove a citation from ${nameOf(b.person_id)}`; break
    case 'sources': head = c.op === 'insert' ? `New source: ${show(d.title)}` : c.op === 'update' ? `Change the source "${show(b.title)}"` : `Delete the source "${show(b.title)}" and its citations`; break
    case 'media': head = c.op === 'insert' ? 'New photo or file' : `Remove ${show(b.caption)}`; break
    default: head = `${c.op} ${c.table}`
  }
  const rows = (c.op === 'update' ? Object.entries(d).filter(([k]) => !HIDDEN.has(k) || k === 'photo_path') : c.op === 'insert' && c.table !== 'family_children' ? fields(d) : []).sort(([a], [b]) => rank(a) - rank(b))
  const photo = c.table === 'media' ? String((c.op === 'insert' ? d.storage_path : b.storage_path) ?? '') : c.table === 'people' && c.op === 'update' && d.photo_path ? String(d.photo_path) : ''
  return (
    <li>
      <p className="font-medium text-ink">{head}</p>
      {photo && <Thumb path={photo} />}
      {rows.length > 0 && (
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {rows.filter(([k]) => k !== 'photo_path').map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-mute">{LABELS[k] ?? k}</dt>
              <dd className="whitespace-pre-wrap">{c.op === 'update' ? <><span className="text-ink-mute line-through decoration-ink-mute/50">{show(b[k], k)}</span> → <span className="text-moss">{show(v, k)}</span></> : show(v, k)}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}

function Thumb({ path }: { path: string }) {
  const { data: url } = useSignedUrl(path)
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className="mt-1 h-28 w-28 rounded border border-line object-cover" /></a> : null
}

function ClaimCard({ profileId, who, note, personId }: { profileId: string; who: string; note: string | null; personId: string }) {
  const review = useReviewClaim()
  const { data: p } = usePerson(personId)
  return (
    <article className="card flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex-1 text-sm">
        <p className="text-[17px] text-ink">{who} says they are {p ? <Link className="text-moss underline underline-offset-2" to={`/trees/${p.tree_id}/people/${p.id}`}>{fullName(p)}</Link> : 'someone in the tree'}</p>
        {note && <p className="mt-1 italic text-ink-soft">“{note}”</p>}
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={review.isPending} onClick={() => review.mutate({ profile: profileId, approve: true })}><Check size={14} /> Confirm</button>
        <button className="btn-ghost" disabled={review.isPending} onClick={() => review.mutate({ profile: profileId, approve: false })}><X size={14} /> Decline</button>
      </div>
    </article>
  )
}

const STATUS: Record<string, { label: string; cls: string }> = {
  approved: { label: 'Added', cls: 'bg-moss-light text-moss' },
  rejected: { label: 'Declined', cls: 'bg-[#F1DCD0] text-[#7A4A32]' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-paper text-ink-mute' },
  reverted: { label: 'Undone', cls: 'bg-paper text-ink-mute' },
}

function HistoryRow({ r, author, reviewer }: { r: ChangeRequest; author: string; reviewer?: string }) {
  const revert = useRevertRequest()
  const [busy, setBusy] = useState(false)
  const s = STATUS[r.status] ?? { label: r.status, cls: 'bg-paper text-ink-mute' }
  const byYou = reviewer && reviewer === author
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-ink">{r.summary}</p>
        <p className="text-[13px] text-ink-mute">
          {byYou ? `By ${author}` : `Suggested by ${author}${reviewer ? ` · ${r.status === 'rejected' ? 'declined' : r.status === 'reverted' ? 'undone' : 'approved'} by ${reviewer}` : ''}`} · {when(r.reviewed_at ?? r.created_at)}
          {r.review_note && <> · “{r.review_note}”</>}
        </p>
      </div>
      <span className={`self-start rounded-full px-2.5 py-0.5 text-[12px] sm:self-center ${s.cls}`}>{s.label}</span>
      {r.status === 'approved' && (
        <button className="btn-ghost self-start sm:self-center" disabled={busy || revert.isPending} title="Put everything this change touched back the way it was"
          onClick={async () => { if (!confirm(`Undo “${r.summary}”? Everything it changed goes back to how it was before.`)) return; setBusy(true); try { await revert.mutateAsync(r.id) } finally { setBusy(false) } }}>
          <RotateCcw size={14} /> Undo
        </button>
      )}
    </li>
  )
}
