import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useSourceMutations, useSources } from '../lib/queries'
import { useCanEdit } from '../lib/profile'
import Modal from '../components/Modal'
import SourceForm from '../components/SourceForm'

export default function SourcesPage() {
  const { treeId = '' } = useParams()
  const { data: sources, isLoading } = useSources(treeId)
  const { create } = useSourceMutations(treeId)
  const [adding, setAdding] = useState(false)
  const canEdit = useCanEdit()
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl">Sources</h2>
          <p className="text-sm text-ink/60">Letters, certificates, photos, interviews, books: anything a fact came from.</p>
        </div>
        {canEdit && <button className="btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add source</button>}
      </div>
      {isLoading && <p className="text-ink/50">Loading…</p>}
      {sources?.length === 0 && <p className="card text-center text-ink/60">No sources yet.</p>}
      <ul className="divide-y divide-line rounded-lg border border-line bg-white">
        {sources?.map((s) => (
          <li key={s.id}>
            <Link to={s.id} className="block px-4 py-2.5 hover:bg-moss-light/50">
              <div className="font-medium">{s.title}</div>
              <div className="text-sm text-ink/50">{[s.author, s.publication, s.repository].filter(Boolean).join(' · ')}</div>
            </Link>
          </li>
        ))}
      </ul>
      {adding && (
        <Modal title="Add source" onClose={() => setAdding(false)}>
          <SourceForm submitting={create.isPending} onCancel={() => setAdding(false)} onSubmit={async (s) => { await create.mutateAsync(s); setAdding(false) }} />
        </Modal>
      )}
    </div>
  )
}
