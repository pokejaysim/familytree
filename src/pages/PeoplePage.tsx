import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useCreatePerson, useTreeData } from '../lib/queries'
import { fullName, lifespan } from '../lib/dates'
import Modal from '../components/Modal'
import PersonForm from '../components/PersonForm'
import Avatar from '../components/Avatar'

export default function PeoplePage() {
  const { treeId = '' } = useParams()
  const nav = useNavigate()
  const { data, isLoading } = useTreeData(treeId)
  const create = useCreatePerson(treeId)
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)

  const people = useMemo(() => {
    const t = q.toLowerCase().trim()
    return (data?.people ?? []).filter((p) => !t || fullName(p).toLowerCase().includes(t) || (p.maiden_name ?? '').toLowerCase().includes(t))
  }, [data, q])

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <input className="input" placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary shrink-0" onClick={() => setAdding(true)}><Plus size={16} /> <span className="hidden sm:inline">Add person</span><span className="sm:hidden">Add</span></button>
      </div>
      {isLoading && <p className="text-ink/50">Loading…</p>}
      {data && data.people.length === 0 && <p className="card text-center text-ink/60">No people yet. Add the first person, then build out parents, partners and children from their profile.</p>}
      <ul className="divide-y divide-line rounded-lg border border-line bg-white">
        {people.map((p) => (
          <li key={p.id}>
            <Link to={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-moss-light/50">
              <Avatar person={p} size={36} />
              <span className="flex-1">{fullName(p)}{p.maiden_name && <span className="text-ink/50"> (née {p.maiden_name})</span>}</span>
              <span className="text-sm text-ink/50">{lifespan(p)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink/50">{people.length} of {data?.people.length ?? 0} people</p>
      {adding && (
        <Modal title="Add person" onClose={() => setAdding(false)}>
          <PersonForm submitting={create.isPending} onCancel={() => setAdding(false)} onSubmit={async (input) => { const p = await create.mutateAsync(input); setAdding(false); nav(`/trees/${treeId}/people/${(p as { id: string }).id}`) }} />
        </Modal>
      )}
    </div>
  )
}
