import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { useSource, useSourceCitations, useSourceMutations } from '../lib/queries'
import { CONFIDENCE_LABELS } from '../lib/types'
import { fullName } from '../lib/dates'
import Modal from '../components/Modal'
import SourceForm from '../components/SourceForm'

export default function SourcePage() {
  const { treeId = '', sourceId = '' } = useParams()
  const nav = useNavigate()
  const { data: s } = useSource(sourceId)
  const { data: cites } = useSourceCitations(sourceId)
  const { update, remove } = useSourceMutations(treeId)
  const [editing, setEditing] = useState(false)
  if (!s) return <p className="p-6 text-ink/50">Loading…</p>
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-serif text-2xl">{s.title}</h2>
          <p className="text-sm text-ink/60">{[s.author, s.publication].filter(Boolean).join(' · ')}</p>
          {s.repository && <p className="text-sm text-ink/60">Repository: {s.repository}</p>}
          {s.url && <a className="text-sm text-moss underline" href={s.url} target="_blank" rel="noreferrer">{s.url}</a>}
        </div>
        <div className="flex gap-1">
          <button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>
          <button className="btn-danger" onClick={async () => { if (confirm('Delete this source and all its citations?')) { await remove.mutateAsync(s.id); nav(`/trees/${treeId}/sources`) } }}><Trash2 size={14} /></button>
        </div>
      </div>
      {s.notes && <p className="card whitespace-pre-wrap text-sm">{s.notes}</p>}
      <section className="card">
        <h3 className="mb-2 font-medium">Cited by</h3>
        {cites?.length === 0 && <p className="text-sm text-ink/50">No citations yet. Add citations from a person's profile.</p>}
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
          <SourceForm initial={s} submitting={update.isPending} onCancel={() => setEditing(false)} onSubmit={async (input) => { await update.mutateAsync({ id: s.id, ...input }); setEditing(false) }} />
        </Modal>
      )}
    </div>
  )
}
