import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { User } from 'lucide-react'
import { useTreeData } from '../lib/queries'
import { buildGraph } from '../lib/graph'
import { fullName } from '../lib/dates'
import TreeChart from '../components/TreeChart'
import PersonPicker from '../components/PersonPicker'
import Modal from '../components/Modal'

export default function ChartPage() {
  const { treeId = '', personId } = useParams()
  const nav = useNavigate()
  const { data } = useTreeData(treeId)
  const graph = useMemo(() => (data ? buildGraph(data) : null), [data])
  const [picking, setPicking] = useState(false)
  const [gens, setGens] = useState(4)

  // Default focus: the person with the most descendants-ish (oldest by birth), else first.
  const focusId = personId ?? data?.people.slice().sort((a, b) => (a.birth_date_sort ?? '9999').localeCompare(b.birth_date_sort ?? '9999'))[0]?.id
  const focus = focusId ? graph?.people.get(focusId) : undefined

  if (!data || !graph) return <p className="p-6 text-ink/50">Loading…</p>
  if (data.people.length === 0)
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="card max-w-md text-center text-ink/60">
          <p className="mb-3">The chart is empty because there are no people yet.</p>
          <Link to={`/trees/${treeId}/people`} className="btn-primary">Add the first person</Link>
        </div>
      </div>
    )

  return (
    <div className="relative h-full">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg border border-line bg-white/90 p-2 shadow-sm backdrop-blur">
        <button className="btn-ghost" onClick={() => setPicking(true)}><User size={14} /> {focus ? fullName(focus) : 'Choose person'}</button>
        <label className="flex items-center gap-1 text-xs text-ink/60">Generations
          <select className="input w-auto py-1" value={gens} onChange={(e) => setGens(+e.target.value)}>{[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        {focus && <Link className="btn-ghost" to={`/trees/${treeId}/people/${focus.id}`}>Open profile</Link>}
      </div>
      <p className="absolute bottom-3 left-3 z-10 text-xs text-ink/40">Drag to pan · scroll to zoom · click a card to re-centre</p>
      {focusId && <TreeChart graph={graph} focusId={focusId} generations={gens} onSelect={(id) => nav(`/trees/${treeId}/chart/${id}`)} />}
      {picking && (
        <Modal title="Centre the chart on…" onClose={() => setPicking(false)}>
          <PersonPicker people={data.people} onPick={(p) => { setPicking(false); nav(`/trees/${treeId}/chart/${p.id}`) }} />
        </Modal>
      )}
    </div>
  )
}
