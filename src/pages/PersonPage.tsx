import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Camera, GitFork, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  uploadToTree, useAddChild, useCitationMutations, useCreateFamily, useCreatePerson, useDeletePerson, useEventMutations,
  useMediaMutations, usePersonCitations, usePersonEvents, usePersonMedia, useRemoveChild, useSignedUrl, useSourceMutations,
  useSources, useTreeData, useUpdateFamily, useUpdatePerson,
} from '../lib/queries'
import { buildGraph } from '../lib/graph'
import { displayName, fullName, lifespan, toSortDate } from '../lib/dates'
import { CONFIDENCE_LABELS, EVENT_TYPES, type Family, type Media, type Person } from '../lib/types'
import Modal from '../components/Modal'
import PersonForm from '../components/PersonForm'
import PickOrCreate from '../components/PickOrCreate'
import SourceForm from '../components/SourceForm'
import Avatar from '../components/Avatar'
import { useCanEdit } from '../lib/profile'

type RelAction = { kind: 'parent' } | { kind: 'partner' } | { kind: 'child'; family: Family } | { kind: 'sibling' }

export default function PersonPage() {
  const { treeId = '', personId = '' } = useParams()
  const nav = useNavigate()
  const { data } = useTreeData(treeId)
  const graph = useMemo(() => (data ? buildGraph(data) : null), [data])
  const person = graph?.people.get(personId)

  const createPerson = useCreatePerson(treeId)
  const updatePerson = useUpdatePerson(treeId, personId)
  const deletePerson = useDeletePerson(treeId)
  const createFamily = useCreateFamily(treeId)
  const updateFamily = useUpdateFamily(treeId)
  const addChild = useAddChild(treeId)
  const removeChild = useRemoveChild(treeId)

  const canEdit = useCanEdit()
  const [editing, setEditing] = useState(false)
  const [rel, setRel] = useState<RelAction | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!data || !graph) return <p className="p-6 text-ink/50">Loading…</p>
  if (!person) return <p className="p-6 text-ink/50">Person not found.</p>

  const parentFamilies = graph.familiesOfChild.get(personId) ?? []
  const ownFamilies = graph.familiesOfParent.get(personId) ?? []
  const parents = graph.parentsOf(personId)
  const siblings = graph.siblingsOf(personId)

  const mkPerson = async (input: Parameters<typeof createPerson.mutateAsync>[0]) => (await createPerson.mutateAsync(input)) as Person

  const applyRelation = async (action: RelAction, other: Person) => {
    if (action.kind === 'parent') {
      // Fill the empty slot of an existing parent family, otherwise create one.
      const open = parentFamilies.find((f) => !f.partner1_id || !f.partner2_id)
      if (open) {
        const patch = open.partner1_id ? { partner2_id: other.id } : { partner1_id: other.id }
        await updateFamily.mutateAsync({ id: open.id, ...patch })
      } else {
        const fam = (await createFamily.mutateAsync({ partner1_id: other.id })) as Family
        await addChild.mutateAsync({ family_id: fam.id, person_id: personId })
      }
    } else if (action.kind === 'partner') {
      await createFamily.mutateAsync({ partner1_id: personId, partner2_id: other.id })
    } else if (action.kind === 'child') {
      await addChild.mutateAsync({ family_id: action.family.id, person_id: other.id })
    } else if (action.kind === 'sibling') {
      let fam = parentFamilies[0]
      if (!fam) {
        fam = (await createFamily.mutateAsync({})) as Family
        await addChild.mutateAsync({ family_id: fam.id, person_id: personId })
      }
      await addChild.mutateAsync({ family_id: fam.id, person_id: other.id })
    }
  }
  const onPhoto = async (file: File) => {
    const path = await uploadToTree(treeId, file)
    await updatePerson.mutateAsync({ photo_path: path })
  }

  const relTitle = rel ? { parent: 'Add parent', partner: 'Add partner / spouse', child: 'Add child', sibling: 'Add sibling' }[rel.kind] : ''
  const relDefaults: Partial<Person> | undefined =
    rel?.kind === 'child' || rel?.kind === 'sibling' ? { surname: person.surname } : rel?.kind === 'parent' ? { surname: person.surname } : undefined

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:space-y-5 sm:p-6">
      {/* Header */}
      <div className="card flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <div className="relative">
          <Avatar person={person} size={96} />
          {canEdit && <button className="absolute -right-1 -bottom-1 rounded-full border border-line bg-white p-1.5 shadow hover:bg-moss-light" title="Change photo" onClick={() => fileRef.current?.click()}><Camera size={14} /></button>}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
        </div>
        <div className="flex-1">
          <h2 className="font-serif text-2xl sm:text-3xl">{displayName(person)}</h2>
          <p className="text-ink/60">{lifespan(person)}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
            {person.birth_date || person.birth_place ? (<><dt className="text-ink/50">Born</dt><dd>{[person.birth_date, person.birth_place].filter(Boolean).join(', ')}</dd></>) : null}
            {!person.is_living && (person.death_date || person.death_place) ? (<><dt className="text-ink/50">Died</dt><dd>{[person.death_date, person.death_place].filter(Boolean).join(', ')}</dd></>) : null}
          </dl>
        </div>
        <div className="flex flex-wrap gap-1">
          <Link className="btn-ghost" to={`/trees/${treeId}/chart/${personId}`}><GitFork size={14} /> Chart</Link>
          {canEdit && <button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>}
          {canEdit && <button className="btn-danger" title="Delete person" onClick={async () => { if (confirm(`Delete ${fullName(person)}? This cannot be undone.`)) { await deletePerson.mutateAsync(personId); nav(`/trees/${treeId}/people`) } }}><Trash2 size={14} /></button>}
        </div>
      </div>

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
              <Group title="Children" people={kids} treeId={treeId} onAdd={canEdit ? () => setRel({ kind: 'child', family: f }) : undefined} onRemove={canEdit ? (p) => removeChild.mutate({ family_id: f.id, person_id: p.id }) : undefined} />
            </div>
          )
        })}
        {canEdit && <button className="btn-ghost" onClick={() => setRel({ kind: 'partner' })}><Plus size={14} /> Add partner / spouse</button>}
      </section>

      <Timeline treeId={treeId} personId={personId} canEdit={canEdit} />
      <Citations treeId={treeId} personId={personId} canEdit={canEdit} />
      <Gallery treeId={treeId} personId={personId} canEdit={canEdit} />

      {editing && (
        <Modal title="Edit person" onClose={() => setEditing(false)}>
          <PersonForm initial={person} submitting={updatePerson.isPending} onCancel={() => setEditing(false)} onSubmit={async (input) => { await updatePerson.mutateAsync(input); setEditing(false) }} />
        </Modal>
      )}
      {rel && (
        <PickOrCreate title={relTitle} people={data.people} exclude={[personId]} defaults={relDefaults} onClose={() => setRel(null)} createPerson={mkPerson} onPick={(p) => applyRelation(rel, p)} />
      )}
    </div>
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

function Timeline({ treeId, personId, canEdit }: { treeId: string; personId: string; canEdit: boolean }) {
  const { data: events } = usePersonEvents(personId)
  const { create, remove } = useEventMutations(treeId, personId)
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ type: 'residence', date_text: '', place: '', description: '' })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    await create.mutateAsync({ type: f.type, date_text: f.date_text || null, date_sort: toSortDate(f.date_text), place: f.place || null, description: f.description || null })
    setAdding(false); setF({ type: 'residence', date_text: '', place: '', description: '' })
  }
  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-serif text-xl">Life events</h3>
        {canEdit && <button className="btn-ghost" onClick={() => setAdding(true)}><Plus size={14} /> Add event</button>}
      </div>
      {events?.length === 0 && !adding && <p className="text-sm text-ink/40">No events yet.{canEdit ? ' Birth and death are shown above; add residences, occupations, immigration, and more here.' : ''}</p>}
      <ul className="divide-y divide-line">
        {events?.map((ev) => (
          <li key={ev.id} className="group flex items-start gap-3 py-2 text-sm">
            <span className="w-28 shrink-0 text-ink/50">{ev.date_text ?? '—'}</span>
            <span className="flex-1"><span className="font-medium capitalize">{ev.type}</span>{ev.place && <span className="text-ink/70"> · {ev.place}</span>}{ev.description && <div className="text-ink/70">{ev.description}</div>}</span>
            {canEdit && <button className="hidden text-ink/40 hover:text-red-700 group-hover:inline" onClick={() => remove.mutate(ev.id)}><Trash2 size={14} /></button>}
          </li>
        ))}
      </ul>
      {adding && (
        <form onSubmit={submit} className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-line bg-paper p-3 sm:grid-cols-2">
          <div><label className="label">Type</label><select className="input capitalize" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className="label">Date</label><input className="input" value={f.date_text} onChange={(e) => setF({ ...f, date_text: e.target.value })} placeholder="e.g. 1954 or Jun 1954" /></div>
          <div><label className="label">Place</label><input className="input" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} /></div>
          <div><label className="label">Description</label><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" disabled={create.isPending}>Add</button></div>
        </form>
      )}
    </section>
  )
}

function Citations({ treeId, personId, canEdit }: { treeId: string; personId: string; canEdit: boolean }) {
  const { data: cites } = usePersonCitations(personId)
  const { data: sources } = useSources(treeId)
  const { create, remove } = useCitationMutations(treeId, personId)
  const { create: createSource } = useSourceMutations(treeId)
  const [adding, setAdding] = useState(false)
  const [newSource, setNewSource] = useState(false)
  const [f, setF] = useState({ source_id: '', page: '', quote: '', confidence: 2 })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    await create.mutateAsync({ source_id: f.source_id, page: f.page || null, quote: f.quote || null, confidence: f.confidence })
    setAdding(false); setF({ source_id: '', page: '', quote: '', confidence: 2 })
  }
  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-serif text-xl">Sources</h3>
        {canEdit && <button className="btn-ghost" onClick={() => setAdding(true)}><Plus size={14} /> Cite a source</button>}
      </div>
      {cites?.length === 0 && !adding && <p className="text-sm text-ink/40">No sources cited yet.{canEdit ? ' Record where each fact came from so future you can trust it.' : ''}</p>}
      <ul className="divide-y divide-line">
        {cites?.map((c) => (
          <li key={c.id} className="group py-2 text-sm">
            <div className="flex items-center gap-2">
              <Link className="font-medium text-moss hover:underline" to={`/trees/${treeId}/sources/${c.source_id}`}>{c.source.title}</Link>
              {c.page && <span className="text-ink/60">· {c.page}</span>}
              <span className="ml-auto text-xs text-ink/50">{CONFIDENCE_LABELS[c.confidence]}</span>
              {canEdit && <button className="hidden text-ink/40 hover:text-red-700 group-hover:inline" onClick={() => remove.mutate(c.id)}><Trash2 size={14} /></button>}
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
                <option value="">Choose…</option>{sources?.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
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
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary" disabled={create.isPending}>Add citation</button></div>
        </form>
      )}
      {newSource && (
        <Modal title="New source" onClose={() => setNewSource(false)}>
          <SourceForm submitting={createSource.isPending} onCancel={() => setNewSource(false)} onSubmit={async (s) => { const created = await createSource.mutateAsync(s); setF({ ...f, source_id: created.id }); setNewSource(false) }} />
        </Modal>
      )}
    </section>
  )
}

function Gallery({ treeId, personId, canEdit }: { treeId: string; personId: string; canEdit: boolean }) {
  const { data: media } = usePersonMedia(personId)
  const { upload, remove } = useMediaMutations(treeId, personId)
  const ref = useRef<HTMLInputElement>(null)
  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-serif text-xl">Photos & documents</h3>
        {canEdit && <button className="btn-ghost" onClick={() => ref.current?.click()} disabled={upload.isPending}><Plus size={14} /> {upload.isPending ? 'Uploading…' : 'Upload'}</button>}
        <input ref={ref} type="file" accept="image/*,application/pdf" hidden multiple onChange={(e) => Array.from(e.target.files ?? []).forEach((file) => upload.mutate({ file }))} />
      </div>
      {media?.length === 0 && <p className="text-sm text-ink/40">No photos or scans yet.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {media?.map((m) => <MediaTile key={m.id} m={m} onDelete={canEdit ? () => { if (confirm('Delete this file?')) remove.mutate(m) } : undefined} />)}
      </div>
    </section>
  )
}

function MediaTile({ m, onDelete }: { m: Media; onDelete?: () => void }) {
  const { data: url } = useSignedUrl(m.storage_path)
  const isImg = m.mime_type?.startsWith('image/')
  return (
    <div className="group relative aspect-square overflow-hidden rounded-md border border-line bg-paper">
      {url && (isImg ? <img src={url} alt={m.caption ?? ''} className="h-full w-full object-cover" /> : <a href={url} target="_blank" rel="noreferrer" className="flex h-full items-center justify-center text-sm text-moss underline">Open document</a>)}
      {onDelete && <button className="absolute top-1 right-1 hidden rounded bg-white/90 p-1 text-red-700 group-hover:block" onClick={onDelete}><Trash2 size={14} /></button>}
      {m.caption && <div className="absolute inset-x-0 bottom-0 bg-ink/60 px-2 py-1 text-xs text-white">{m.caption}</div>}
    </div>
  )
}
