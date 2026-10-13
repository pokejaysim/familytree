import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BadgeCheck, Camera, Clock3, GitFork, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { uploadToTree, usePersonCitations, usePersonEvents, usePersonMedia, useSignedUrl, useSources, useTreeData, type PersonInput } from '../lib/queries'
import { newId, useClaimPerson, usePendingFor, useSubmit, useWithdrawRequest, type Change } from '../lib/changes'
import { buildGraph } from '../lib/graph'
import { displayName, fullName, lifespan, toSortDate } from '../lib/dates'
import { CONFIDENCE_LABELS, EVENT_TYPES, type Family, type Media, type Person, type Source } from '../lib/types'
import Modal from '../components/Modal'
import PersonForm from '../components/PersonForm'
import PickOrCreate from '../components/PickOrCreate'
import SourceForm from '../components/SourceForm'
import Avatar from '../components/Avatar'
import Lightbox from '../components/Lightbox'
import { useAuth } from '../lib/auth'
import { useCanEdit, useIsAdmin, useProfile, useSaveLabel } from '../lib/profile'
import { ADMIN_NAME } from '../config'

type RelAction = { kind: 'parent' } | { kind: 'partner' } | { kind: 'child'; family: Family } | { kind: 'sibling' }

export default function PersonPage() {
  const { treeId = '', personId = '' } = useParams()
  const nav = useNavigate()
  const { data } = useTreeData(treeId)
  const graph = useMemo(() => (data ? buildGraph(data) : null), [data])
  const person = graph?.people.get(personId)
  const submit = useSubmit(treeId)
  const canEdit = useCanEdit()
  const isAdmin = useIsAdmin()
  const saveLabel = useSaveLabel()
  const [editing, setEditing] = useState(false)
  const [rel, setRel] = useState<RelAction | null>(null)
  const { data: media = [] } = usePersonMedia(personId)
  const { data: cites } = usePersonCitations(personId)
  const [viewing, setViewing] = useState<number | null>(null)
  const [openCite, setOpenCite] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!data || !graph) return <p className="p-6 text-ink/50">Loading…</p>
  if (!person) return <p className="p-6 text-ink/50">Person not found.</p>

  const name = fullName(person)
  const parentFamilies = graph.familiesOfChild.get(personId) ?? []
  const ownFamilies = graph.familiesOfParent.get(personId) ?? []
  const parents = graph.parentsOf(personId)
  const siblings = graph.siblingsOf(personId)
  const send = (summary: string, changes: Change[]) => submit.mutateAsync({ summary, subject: personId, changes })

  const draftPerson = (input: PersonInput): Person => ({ ...(input as Person), id: newId(), tree_id: treeId })
  const applyRelation = async (action: RelAction, other: Person, isNew: boolean) => {
    const changes: Change[] = []
    if (isNew) { const { tree_id: _t, ...row } = other; changes.push({ table: 'people', op: 'insert', data: row }) }
    const link = (family_id: string, person_id: string): Change => ({ table: 'family_children', op: 'insert', data: { family_id, person_id } })
    if (action.kind === 'parent') {
      // Fill the empty slot of an existing parent family, otherwise start one.
      const open = parentFamilies.find((f) => !f.partner1_id || !f.partner2_id)
      if (open) changes.push({ table: 'families', op: 'update', key: { id: open.id }, data: open.partner1_id ? { partner2_id: other.id } : { partner1_id: other.id } })
      else { const id = newId(); changes.push({ table: 'families', op: 'insert', data: { id, partner1_id: other.id } }, link(id, personId)) }
    } else if (action.kind === 'partner') {
      changes.push({ table: 'families', op: 'insert', data: { id: newId(), partner1_id: personId, partner2_id: other.id } })
    } else if (action.kind === 'child') {
      changes.push(link(action.family.id, other.id))
    } else {
      let fam = parentFamilies[0]?.id
      if (!fam) { fam = newId(); changes.push({ table: 'families', op: 'insert', data: { id: fam } }, link(fam, personId)) }
      changes.push(link(fam, other.id))
    }
    const word = { parent: 'a parent', partner: 'a partner', child: 'a child', sibling: 'a sibling' }[action.kind]
    await send(`${isNew ? 'Add' : 'Link'} ${fullName(other)} as ${word} of ${name}`, changes)
  }
  const onPhoto = async (file: File) => {
    const path = await uploadToTree(treeId, file)
    await send(`New profile photo for ${name}`, [
      { table: 'media', op: 'insert', data: { id: newId(), person_id: personId, storage_path: path, mime_type: file.type, caption: `Profile photo of ${name}` } },
      { table: 'people', op: 'update', key: { id: personId }, data: { photo_path: path } },
    ])
  }

  const relTitle = rel ? { parent: 'Add parent', partner: 'Add partner / spouse', child: 'Add child', sibling: 'Add sibling' }[rel.kind] : ''
  const relDefaults: Partial<Person> | undefined = rel?.kind === 'child' || rel?.kind === 'sibling' || rel?.kind === 'parent' ? { surname: person.surname } : undefined

  // What's missing from this profile: each becomes an invitation in the "Help complete" box.
  const missing: { label: string; act: () => void }[] = []
  if (!person.photo_path) missing.push({ label: 'Add a photo', act: () => fileRef.current?.click() })
  if (!person.birth_date) missing.push({ label: 'Add a birth date', act: () => setEditing(true) })
  if (!person.birth_place) missing.push({ label: 'Add where they were born', act: () => setEditing(true) })
  if (!person.is_living && !person.death_date) missing.push({ label: 'Add when they died', act: () => setEditing(true) })
  if (!person.bio) missing.push({ label: 'Write a few lines about them', act: () => setEditing(true) })
  if (parents.length === 0) missing.push({ label: 'Add their parents', act: () => setRel({ kind: 'parent' }) })
  if (cites && cites.length === 0) missing.push({ label: 'Say where the information came from', act: () => setOpenCite((n) => n + 1) })

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:space-y-5 sm:p-6">
      {/* Header */}
      <div className="card flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <div className="relative self-start">
          <button type="button" className="block rounded-full" title={person.photo_path ? 'View photo' : undefined} onClick={() => { const i = media.findIndex((m) => m.storage_path === person.photo_path); if (i >= 0) setViewing(i) }}><Avatar person={person} size={144} /></button>
          {canEdit && <button className="absolute -right-1 -bottom-1 rounded-full border border-line bg-white p-1.5 shadow hover:bg-moss-light" title={person.photo_path ? 'Change photo' : 'Add a photo'} onClick={() => fileRef.current?.click()}><Camera size={14} /></button>}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f) }} />
        </div>
        <div className="flex-1">
          <h2 className="font-serif text-2xl sm:text-3xl">{displayName(person)}</h2>
          <p className="text-ink/60">{lifespan(person)}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
            {person.birth_date || person.birth_place ? (<><dt className="text-ink/50">Born</dt><dd>{[person.birth_date, person.birth_place].filter(Boolean).join(', ')}</dd></>) : null}
            {!person.is_living && (person.death_date || person.death_place) ? (<><dt className="text-ink/50">Died</dt><dd>{[person.death_date, person.death_place].filter(Boolean).join(', ')}</dd></>) : null}
          </dl>
          <ThisIsMe person={person} />
        </div>
        <div className="flex flex-wrap gap-1">
          <Link className="btn-ghost" to={`/trees/${treeId}/chart/${personId}`}><GitFork size={14} /> Chart</Link>
          {canEdit && <button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={14} /> {isAdmin ? 'Edit' : 'Suggest an edit'}</button>}
          {canEdit && <button className="btn-danger" title={isAdmin ? 'Delete person' : 'Suggest removing this person'} onClick={async () => {
            if (!confirm(isAdmin ? `Delete ${name}? You can undo this from the Review page.` : `Suggest removing ${name} from the tree? ${ADMIN_NAME} will review it first.`)) return
            const r = await send(`Remove ${name} from the tree`, [{ table: 'people', op: 'delete', key: { id: personId } }])
            if (r.status === 'approved') nav(`/trees/${treeId}/people`)
          }}><Trash2 size={14} /></button>}
        </div>
      </div>

      <PendingNotice personId={personId} />
      <HelpCard name={person.given_names.split(' ')[0] || name} missing={missing} canEdit={canEdit} isAdmin={isAdmin} />

      {person.bio && <p className="card whitespace-pre-wrap text-sm">{person.bio}</p>}

      {/* Family */}
      <section className="card space-y-4">
        <div className="flex items-center justify-between"><h3 className="font-serif text-xl">Family</h3></div>
        <Group title="Parents" people={parents} treeId={treeId} onAdd={canEdit && parents.length < 2 ? () => setRel({ kind: 'parent' }) : undefined} />
        <Group title="Siblings" people={siblings} treeId={treeId} onAdd={canEdit ? () => setRel({ kind: 'sibling' }) : undefined} />
        {ownFamilies.map((f) => {
          const partner = graph.partnerOf(f, personId)
          const kids = graph.childrenOfFamily.get(f.id) ?? []
          return (
            <div key={f.id} className="rounded-md border border-line p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span>
                  <span className="text-ink/50">{f.union_type === 'marriage' ? 'Married to ' : 'Partner: '}</span>
                  {partner ? <Link className="font-medium text-moss hover:underline" to={`/trees/${treeId}/people/${partner.id}`}>{fullName(partner)}</Link> : <span className="text-ink/50">unknown</span>}
                  {f.start_date && <span className="text-ink/50"> · {f.start_date}{f.start_place ? `, ${f.start_place}` : ''}</span>}
                </span>
              </div>
              <Group title="Children" people={kids} treeId={treeId} onAdd={canEdit ? () => setRel({ kind: 'child', family: f }) : undefined}
                onRemove={canEdit ? (p) => { if (confirm(`Remove ${fullName(p)} from this family?`)) send(`Remove ${fullName(p)} as a child of ${name}`, [{ table: 'family_children', op: 'delete', key: { family_id: f.id, person_id: p.id } }]) } : undefined} />
            </div>
          )
        })}
        {canEdit && <button className="btn-ghost" onClick={() => setRel({ kind: 'partner' })}><Plus size={14} /> Add partner / spouse</button>}
      </section>

      <Timeline treeId={treeId} person={person} canEdit={canEdit} openToken={0} send={send} />
      <Citations treeId={treeId} person={person} canEdit={canEdit} openToken={openCite} send={send} />
      <Gallery treeId={treeId} person={person} canEdit={canEdit} onOpen={setViewing} send={send} />
      {viewing !== null && media[viewing] && <Lightbox items={media} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />}

      {editing && (
        <Modal title={isAdmin ? 'Edit person' : `Suggest an edit to ${name}`} onClose={() => setEditing(false)}>
          {!isAdmin && <p className="mb-3 text-sm text-ink-mute">Change anything you know is wrong or missing. {ADMIN_NAME} checks every change before it appears.</p>}
          <PersonForm initial={person} submitting={submit.isPending} submitLabel={saveLabel} onCancel={() => setEditing(false)}
            onSubmit={async (input) => { await send(`Edit details of ${name}`, [{ table: 'people', op: 'update', key: { id: personId }, data: changedFields(person, input) }]); setEditing(false) }} />
        </Modal>
      )}
      {rel && (
        <PickOrCreate title={relTitle} people={data.people} exclude={[personId]} defaults={relDefaults} submitLabel={saveLabel} onClose={() => setRel(null)} draftPerson={draftPerson} onPick={(p, isNew) => applyRelation(rel, p, isNew)} />
      )}
    </div>
  )
}

/** Only the fields that actually changed, so the review shows a tidy before → after list. */
function changedFields(before: Person, after: PersonInput): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(after)) if ((before as unknown as Record<string, unknown>)[k] !== v) out[k] = v
  return out
}

/** "This is me": link your account to your own profile (an admin confirms it). */
function ThisIsMe({ person }: { person: Person }) {
  const { data: profile } = useProfile()
  const claim = useClaimPerson()
  if (!profile) return null
  const mine = profile.person_id === person.id
  if (mine && profile.person_status === 'approved') return <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-moss-light px-3 py-1 text-sm text-moss"><BadgeCheck size={15} /> This is you</p>
  if (mine) return (
    <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-mute"><Clock3 size={15} className="text-brass" /> Waiting for {ADMIN_NAME} to confirm this is you.
      <button className="text-brass underline underline-offset-2 hover:text-moss" onClick={() => claim.mutate(null)}>Cancel</button></p>
  )
  if (profile.person_id || !person.is_living) return null
  return (
    <button className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-moss px-3 py-1 text-sm text-moss hover:bg-moss-light" onClick={() => { if (confirm(`Link your account to ${fullName(person)}? ${ADMIN_NAME} will confirm it.`)) claim.mutate(person.id) }}>
      <UserRound size={15} /> This is me
    </button>
  )
}

/** Changes to this profile that are still waiting for review. */
function PendingNotice({ personId }: { personId: string }) {
  const { session } = useAuth()
  const isAdmin = useIsAdmin()
  const { data: pending = [] } = usePendingFor(personId)
  const withdraw = useWithdrawRequest()
  if (pending.length === 0) return null
  return (
    <section className="rounded-md border border-brass-light/60 bg-[#FBF5E6] p-4">
      <p className="flex items-center gap-2 text-[15px] text-ink"><Clock3 size={16} className="text-brass" />
        {pending.length === 1 ? 'One change to this profile is' : `${pending.length} changes to this profile are`} waiting for {ADMIN_NAME}'s review
      </p>
      <ul className="mt-2 space-y-1 text-sm text-ink-soft">
        {pending.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2">
            <span>· {r.summary}</span>
            {r.author_id === session?.user.id && !isAdmin && <button className="text-brass underline underline-offset-2 hover:text-moss" onClick={() => withdraw.mutate(r.id)}>Withdraw</button>}
          </li>
        ))}
      </ul>
      {isAdmin && <Link to="/review" className="mt-2 inline-block text-[12px] uppercase tracking-[.12em] text-brass underline underline-offset-4 hover:text-moss">Review now</Link>}
    </section>
  )
}

/** Invitation to fill in what's missing, so it's obvious anyone can contribute. */
function HelpCard({ name, missing, canEdit, isAdmin }: { name: string; missing: { label: string; act: () => void }[]; canEdit: boolean; isAdmin: boolean }) {
  if (!canEdit) return (
    <p className="rounded-md border border-line bg-paper px-4 py-3 text-sm text-ink-soft">
      Know something about {name}? Your account can view the tree. Ask {ADMIN_NAME} to let you contribute, or <Link to="/contribute" className="text-brass underline underline-offset-2">see how contributing works</Link>.
    </p>
  )
  if (missing.length === 0 && isAdmin) return null
  return (
    <section className="rounded-md border border-line bg-paper p-4">
      <p className="text-[17px] text-ink">{missing.length ? `Help complete ${name}'s profile` : `Know more about ${name}?`}</p>
      <p className="mt-0.5 text-sm text-ink-mute">
        {missing.length ? 'Anything you know helps, even an approximate date.' : 'Add a story, a photo or a correction.'}
        {!isAdmin && ` ${ADMIN_NAME} checks each change before it appears.`} <Link to="/contribute" className="text-brass underline underline-offset-2">How to contribute</Link>
      </p>
      {missing.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {missing.map((m) => <button key={m.label} className="inline-flex items-center gap-1 rounded-full border border-moss/40 bg-white px-3 py-1 text-sm text-moss hover:border-moss hover:bg-moss-light" onClick={m.act}><Plus size={13} /> {m.label}</button>)}
        </div>
      )}
    </section>
  )
}

function Group({ title, people, treeId, onAdd, onRemove }: { title: string; people: Person[]; treeId: string; onAdd?: () => void; onRemove?: (p: Person) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <span className="label mb-0">{title}</span>
        {onAdd && <button className="rounded p-0.5 text-moss hover:bg-moss-light" title={`Add ${title.toLowerCase()}`} onClick={onAdd}><Plus size={14} /></button>}
      </div>
      {people.length === 0 ? <p className="text-sm text-ink/40">None recorded</p> : (
        <ul className="flex flex-wrap gap-2">
          {people.map((p) => (
            <li key={p.id} className="group flex items-center gap-2 rounded-full border border-line bg-paper py-1 pr-3 pl-1 text-sm">
              <Avatar person={p} size={24} />
              <Link className="hover:underline" to={`/trees/${treeId}/people/${p.id}`}>{fullName(p)}</Link>
              <span className="text-ink/40">{lifespan(p)}</span>
              {onRemove && <button className="hidden text-ink/40 hover:text-red-700 group-hover:inline" title="Remove from family" onClick={() => onRemove(p)}>×</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Send = (summary: string, changes: Change[]) => Promise<{ status: string }>

function useOpenOn(token: number, open: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => { if (token > 0) { open(); requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })) } }, [token]) // eslint-disable-line react-hooks/exhaustive-deps
}

function Section({ title, action, children, innerRef }: { title: string; action?: ReactNode; children: ReactNode; innerRef?: React.RefObject<HTMLElement | null> }) {
  return (
    <section ref={innerRef as React.RefObject<HTMLElement>} className="card">
      <div className="mb-2 flex items-center justify-between"><h3 className="font-serif text-xl">{title}</h3>{action}</div>
      {children}
    </section>
  )
}

function Timeline({ treeId, person, canEdit, openToken, send }: { treeId: string; person: Person; canEdit: boolean; openToken: number; send: Send }) {
  const { data: events } = usePersonEvents(person.id)
  const saveLabel = useSaveLabel()
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLElement>(null)
  useOpenOn(openToken, () => setAdding(true), ref)
  const [f, setF] = useState({ type: 'residence', date_text: '', place: '', description: '' })
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true)
    try {
      await send(`Add a life event (${f.type}) for ${fullName(person)}`, [{ table: 'events', op: 'insert', data: { id: newId(), person_id: person.id, type: f.type, date_text: f.date_text || null, date_sort: toSortDate(f.date_text), place: f.place || null, description: f.description || null } }])
      setAdding(false); setF({ type: 'residence', date_text: '', place: '', description: '' })
    } finally { setBusy(false) }
  }
  void treeId
  return (
    <Section title="Life events" innerRef={ref} action={canEdit && <button className="btn-ghost" onClick={() => setAdding(true)}><Plus size={14} /> Add event</button>}>
      {events?.length === 0 && !adding && <p className="text-sm text-ink/40">No events yet.{canEdit ? ' Birth and death are shown above; add schooling, work, moves, baptisms and more here.' : ''}</p>}
      <ul className="divide-y divide-line">
        {events?.map((ev) => (
          <li key={ev.id} className="group flex items-start gap-3 py-2 text-sm">
            <span className="w-28 shrink-0 text-ink/50">{ev.date_text ?? '—'}</span>
            <span className="flex-1"><span className="font-medium capitalize">{ev.type}</span>{ev.place && <span className="text-ink/70"> · {ev.place}</span>}{ev.description && <div className="text-ink/70">{ev.description}</div>}</span>
            {canEdit && <button className="hidden text-ink/40 hover:text-red-700 group-hover:inline" title="Remove event" onClick={() => { if (confirm('Remove this event?')) send(`Remove a life event (${ev.type}) from ${fullName(person)}`, [{ table: 'events', op: 'delete', key: { id: ev.id } }]) }}><Trash2 size={14} /></button>}
          </li>
        ))}
      </ul>
      {adding && (
        <form onSubmit={submit} className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-line bg-paper p-3 sm:grid-cols-2">
          <div><label className="label">Type</label><select className="input capitalize" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className="label">Date</label><input className="input" value={f.date_text} onChange={(e) => setF({ ...f, date_text: e.target.value })} placeholder="e.g. 1954, Jun 1954 or abt 1954" /></div>
          <div><label className="label">Place</label><input className="input" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} /></div>
          <div><label className="label">Description</label><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : saveLabel}</button></div>
        </form>
      )}
    </Section>
  )
}

function Citations({ treeId, person, canEdit, openToken, send }: { treeId: string; person: Person; canEdit: boolean; openToken: number; send: Send }) {
  const { data: cites } = usePersonCitations(person.id)
  const { data: sources = [] } = useSources(treeId)
  const saveLabel = useSaveLabel()
  const [adding, setAdding] = useState(false)
  const [newSource, setNewSource] = useState(false)
  const [draft, setDraft] = useState<Source | null>(null) // a source described here, submitted together with the citation
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLElement>(null)
  useOpenOn(openToken, () => setAdding(true), ref)
  const [f, setF] = useState({ source_id: '', page: '', quote: '', confidence: 2 })
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true)
    try {
      const changes: Change[] = []
      if (draft && f.source_id === draft.id) { const { tree_id: _t, created_at: _c, ...row } = draft; changes.push({ table: 'sources', op: 'insert', data: row }) }
      changes.push({ table: 'citations', op: 'insert', data: { id: newId(), person_id: person.id, source_id: f.source_id, page: f.page || null, quote: f.quote || null, confidence: f.confidence } })
      await send(`Cite a source for ${fullName(person)}`, changes)
      setAdding(false); setDraft(null); setF({ source_id: '', page: '', quote: '', confidence: 2 })
    } finally { setBusy(false) }
  }
  const options = draft ? [...sources, draft] : sources
  return (
    <Section title="Sources" innerRef={ref} action={canEdit && <button className="btn-ghost" onClick={() => setAdding(true)}><Plus size={14} /> Cite a source</button>}>
      {cites?.length === 0 && !adding && <p className="text-sm text-ink/40">No sources cited yet.{canEdit ? ' Record where each fact came from: the book, a letter, a certificate, or what a relative told you.' : ''}</p>}
      <ul className="divide-y divide-line">
        {cites?.map((c) => (
          <li key={c.id} className="group py-2 text-sm">
            <div className="flex items-center gap-2">
              <Link className="font-medium text-moss hover:underline" to={`/trees/${treeId}/sources/${c.source_id}`}>{c.source.title}</Link>
              {c.page && <span className="text-ink/60">· {c.page}</span>}
              <span className="ml-auto text-xs text-ink/50">{CONFIDENCE_LABELS[c.confidence]}</span>
              {canEdit && <button className="hidden text-ink/40 hover:text-red-700 group-hover:inline" title="Remove citation" onClick={() => { if (confirm('Remove this citation?')) send(`Remove a citation from ${fullName(person)}`, [{ table: 'citations', op: 'delete', key: { id: c.id } }]) }}><Trash2 size={14} /></button>}
            </div>
            {c.quote && <blockquote className="mt-1 border-l-2 border-line pl-2 italic text-ink/70">{c.quote}</blockquote>}
          </li>
        ))}
      </ul>
      {adding && (
        <form onSubmit={submit} className="mt-3 space-y-3 rounded-md border border-line bg-paper p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1"><label className="label">Source</label>
              <select className="input" required value={f.source_id} onChange={(e) => setF({ ...f, source_id: e.target.value })}>
                <option value="">Choose…</option>{options.map((s) => <option key={s.id} value={s.id}>{s.title}{s === draft ? ' (new)' : ''}</option>)}
              </select>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setNewSource(true)}>New source</button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="label">Page / record / location in source</label><input className="input" value={f.page} onChange={(e) => setF({ ...f, page: e.target.value })} /></div>
            <div><label className="label">Confidence</label>
              <select className="input" value={f.confidence} onChange={(e) => setF({ ...f, confidence: +e.target.value })}>{CONFIDENCE_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}</select>
            </div>
          </div>
          <div><label className="label">Quote / transcription</label><textarea className="input min-h-16" value={f.quote} onChange={(e) => setF({ ...f, quote: e.target.value })} /></div>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : saveLabel}</button></div>
        </form>
      )}
      {newSource && (
        <Modal title="New source" onClose={() => setNewSource(false)}>
          <SourceForm submitLabel="Use this source" onCancel={() => setNewSource(false)} onSubmit={(s) => { const d = { ...(s as Source), id: newId(), tree_id: treeId, created_at: '' }; setDraft(d); setF({ ...f, source_id: d.id }); setNewSource(false) }} />
        </Modal>
      )}
    </Section>
  )
}

function Gallery({ treeId, person, canEdit, onOpen, send }: { treeId: string; person: Person; canEdit: boolean; onOpen: (i: number) => void; send: Send }) {
  const { data: media } = usePersonMedia(person.id)
  const [uploading, setUploading] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  const upload = async (file: File) => {
    setUploading((n) => n + 1)
    try {
      const path = await uploadToTree(treeId, file)
      await send(`Add ${file.type.startsWith('image/') ? 'a photo' : 'a document'} to ${fullName(person)}'s gallery`, [
        { table: 'media', op: 'insert', data: { id: newId(), person_id: person.id, storage_path: path, mime_type: file.type, caption: file.name.replace(/\.[^.]+$/, '') } },
      ])
    } finally { setUploading((n) => n - 1) }
  }
  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-serif text-xl">Photos & documents</h3>
        {canEdit && <button className="btn-ghost" onClick={() => ref.current?.click()} disabled={uploading > 0}><Plus size={14} /> {uploading > 0 ? 'Uploading…' : 'Upload'}</button>}
        <input ref={ref} type="file" accept="image/*,application/pdf" hidden multiple onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; files.forEach(upload) }} />
      </div>
      {media?.length === 0 && <p className="text-sm text-ink/40">No photos or scans yet.{canEdit ? ' Upload old photos, certificates or letters. A phone photo of a print is fine.' : ''}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {media?.map((m, i) => <MediaTile key={m.id} m={m} onOpen={() => onOpen(i)} onDelete={canEdit ? () => { if (confirm('Remove this file?')) send(`Remove a photo from ${fullName(person)}'s gallery`, [{ table: 'media', op: 'delete', key: { id: m.id } }]) } : undefined} />)}
      </div>
    </section>
  )
}

export function MediaTile({ m, onDelete, onOpen }: { m: Media; onDelete?: () => void; onOpen?: () => void }) {
  const { data: url } = useSignedUrl(m.storage_path)
  const isImg = m.mime_type?.startsWith('image/')
  return (
    <div className="group relative aspect-square overflow-hidden rounded-md border border-line bg-paper">
      {url && (isImg
        ? <img src={url} alt={m.caption ?? ''} className={`h-full w-full object-cover ${onOpen ? 'cursor-zoom-in' : ''}`} onClick={onOpen} />
        : <a href={url} target="_blank" rel="noreferrer" className="flex h-full items-center justify-center text-sm text-moss underline">Open document</a>)}
      {onDelete && <button className="absolute top-1 right-1 hidden rounded bg-white/90 p-1 text-red-700 group-hover:block" onClick={onDelete}><Trash2 size={14} /></button>}
      {m.caption && <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-ink/60 px-2 py-1 text-xs text-white">{m.caption}</div>}
    </div>
  )
}
