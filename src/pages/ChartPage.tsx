import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Maximize2, Minus, Plus, Search } from 'lucide-react'
import { useTreeData } from '../lib/queries'
import { buildGraph } from '../lib/graph'
import TreeCanvas, { type TreeCanvasHandle } from '../components/TreeCanvas'
import PersonSpotlight from '../components/PersonSpotlight'
import PersonPicker from '../components/PersonPicker'
import Modal from '../components/Modal'

export default function ChartPage() {
  const { treeId = '', personId } = useParams()
  const nav = useNavigate()
  const { data } = useTreeData(treeId)
  const graph = useMemo(() => (data ? buildGraph(data) : null), [data])
  const canvas = useRef<TreeCanvasHandle | null>(null)
  const [picking, setPicking] = useState(false)
  const selected = personId && graph ? graph.people.get(personId) ?? null : null

  // Deep link: /chart/:personId zooms to that person once the layout exists
  useEffect(() => { if (personId && graph) requestAnimationFrame(() => canvas.current?.zoomTo(personId)) }, [personId, graph])

  const select = (id: string | null) => nav(id ? `/trees/${treeId}/chart/${id}` : `/trees/${treeId}/chart`, { replace: true })

  if (!data || !graph) return <p className="p-6 text-ink/50">Loading…</p>
  if (data.people.length === 0)
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="card max-w-md text-center text-ink/60">
          <p className="mb-3">The canvas is empty because there are no people yet.</p>
          <Link to={`/trees/${treeId}/people`} className="btn-primary">Add the first person</Link>
        </div>
      </div>
    )

  return (
    <div className="relative h-full overflow-hidden">
      <style>{`@keyframes slideIn { from { transform: translateX(40px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
      <TreeCanvas graph={graph} selectedId={selected?.id ?? null} onSelect={select} handleRef={canvas} />

      <div className="absolute top-3 left-3 z-10 flex gap-1 rounded-xl border border-line bg-white/90 p-1.5 shadow-sm backdrop-blur">
        <button className="btn-ghost border-0" onClick={() => setPicking(true)}><Search size={14} /> Find person</button>
      </div>
      <div className="absolute bottom-4 left-3 z-10 flex flex-col gap-1 rounded-xl border border-line bg-white/90 p-1 shadow-sm backdrop-blur">
        <button className="rounded-lg p-2 hover:bg-moss-light" title="Zoom in" onClick={() => canvas.current?.zoomBy(1.5)}><Plus size={16} /></button>
        <button className="rounded-lg p-2 hover:bg-moss-light" title="Zoom out" onClick={() => canvas.current?.zoomBy(1 / 1.5)}><Minus size={16} /></button>
        <button className="rounded-lg p-2 hover:bg-moss-light" title="Fit whole tree" onClick={() => { select(null); canvas.current?.fit() }}><Maximize2 size={16} /></button>
      </div>
      <p className="absolute bottom-4 left-16 z-10 text-xs text-ink/40">Drag to pan · scroll or pinch to zoom · click a person to zoom in</p>

      {selected && <PersonSpotlight person={selected} graph={graph} treeId={treeId} onClose={() => select(null)} onJump={select} />}
      {picking && (
        <Modal title="Find a person" onClose={() => setPicking(false)}>
          <PersonPicker people={data.people} onPick={(p) => { setPicking(false); select(p.id) }} />
        </Modal>
      )}
    </div>
  )
}
