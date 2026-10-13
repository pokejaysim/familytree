import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { uploadToTree, useSource, useSourceCitations, useSourceMedia } from '../lib/queries'
import { newId, useSubmit } from '../lib/changes'
import { MediaTile } from './PersonPage'
import Lightbox from '../components/Lightbox'
import { CONFIDENCE_LABELS } from '../lib/types'
import { useCanEdit, useIsAdmin, useSaveLabel } from '../lib/profile'
import { fullName } from '../lib/dates'
import Modal from '../components/Modal'
import SourceForm from '../components/SourceForm'

export default function SourcePage() {
  const { treeId = '', sourceId = '' } = useParams()
  const nav = useNavigate()
  const { data: s } = useSource(sourceId)
  const { data: cites } = useSourceCitations(sourceId)
  const submit = useSubmit(treeId)
  const isAdmin = useIsAdmin()
  const saveLabel = useSaveLabel()
  const [uploading, setUploading] = useState(0)
  const [editing, setEditing] = useState(false)
  const canEdit = useCanEdit()
  const { data: pages } = useSourceMedia(sourceId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  if (!s) return <p className="p-6 text-ink/50">Loading…</p>
  const addPage = async (file: File) => {
    setUploading((n) => n + 1)
    try {
      const path = await uploadToTree(treeId, file)
      await submit.mutateAsync({ summary: `Add a scanned page to "${s.title}"`, changes: [{ table: 'media', op: 'insert', data: { id: newId(), source_id: sourceId, storage_path: path, mime_type: file.type, caption: file.name.replace(/\.[^.]+$/, '') } }] })
    } finally { setUploading((n) => n - 1) }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl">{s.title}</h2>
          <p className="text-sm text-ink/60">{[s.author, s.publication].filter(Boolean).join(' · ')}</p>
          {s.repository && <p className="text-sm text-ink/60">Repository: {s.repository}</p>}
          {s.url && <a className="text-sm text-moss underline" href={s.url} target="_blank" rel="noreferrer">{s.url}</a>}
        </div>
        {canEdit && <div className="flex gap-1">
          <button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={14} /> {isAdmin ? 'Edit' : 'Suggest an edit'}</button>
          <button className="btn-danger" onClick={async () => { if (confirm(isAdmin ? 'Delete this source and all its citations? You can undo this from the Review page.' : 'Suggest deleting this source? It will be reviewed first.')) { const r = await submit.mutateAsync({ summary: `Delete the source "${s.title}"`, changes: [{ table: 'sources', op: 'delete', key: { id: s.id } }] }); if (r.status === 'approved') nav(`/trees/${treeId}/sources`) } }}><Trash2 size={14} /></button>
        </div>}
      </div>
      {s.notes && <p className="card whitespace-pre-wrap text-sm">{s.notes}</p>}
      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-medium">Scanned pages</h3>
          {canEdit && <button className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading > 0}><Plus size={14} /> {uploading > 0 ? 'Uploading…' : 'Add pages'}</button>}
          <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden multiple onChange={(e) => { const files = Array.from(e.target.files ?? []); e.target.value = ''; files.forEach(addPage) }} />
        </div>
        {pages?.length === 0 && <p className="text-sm text-ink/50">No pages scanned yet.</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {pages?.map((m, i) => <MediaTile key={m.id} m={m} onOpen={() => setViewing(i)} onDelete={canEdit ? () => { if (confirm('Remove this page?')) submit.mutate({ summary: `Remove a scanned page from "${s.title}"`, changes: [{ table: 'media', op: 'delete', key: { id: m.id } }] }) } : undefined} />)}
        </div>
      </section>
      {viewing !== null && pages?.[viewing] && <Lightbox items={pages} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />}
      <section className="card">
        <h3 className="mb-2 font-medium">Cited by</h3>
        {cites?.length === 0 && <p className="text-sm text-ink/50">No citations yet.{canEdit ? " Add citations from a person's profile." : ''}</p>}
        <ul className="divide-y divide-line">
          {cites?.map((c) => (
            <li key={c.id} className="py-2 text-sm">
              {c.person && <Link className="font-medium text-moss hover:underline" to={`/trees/${treeId}/people/${c.person.id}`}>{fullName(c.person)}</Link>}
              {c.page && <span className="text-ink/60"> · {c.page}</span>}
              <span className="text-ink/50"> · {CONFIDENCE_LABELS[c.confidence]}</span>
              {c.quote && <blockquote className="mt-1 border-l-2 border-line pl-2 italic text-ink/70">{c.quote}</blockquote>}
            </li>
          ))}
        </ul>
      </section>
      {editing && (
        <Modal title="Edit source" onClose={() => setEditing(false)}>
          <SourceForm initial={s} submitting={submit.isPending} submitLabel={saveLabel} onCancel={() => setEditing(false)} onSubmit={async (input) => { await submit.mutateAsync({ summary: `Edit the source "${s.title}"`, changes: [{ table: 'sources', op: 'update', key: { id: s.id }, data: input }] }); setEditing(false) }} />
        </Modal>
      )}
    </div>
  )
}
