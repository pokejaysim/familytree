import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Minus, Plus, Search, User } from 'lucide-react'
import { useTree, useTreeData } from '../lib/queries'
import { buildGraph } from '../lib/graph'
import TreeCanvas, { type LayoutInfo, type TreeCanvasHandle } from '../components/TreeCanvas'
import PersonSpotlight from '../components/PersonSpotlight'
import PersonPicker from '../components/PersonPicker'
import Modal from '../components/Modal'
import { useCanEdit } from '../lib/profile'

export default function ChartPage() {
  const { treeId = '', personId } = useParams()
  const nav = useNavigate()
  const { data } = useTreeData(treeId)
  const { data: tree } = useTree(treeId)
  const graph = useMemo(() => (data ? buildGraph(data) : null), [data])
  const canvas = useRef<TreeCanvasHandle | null>(null)
  const [picking, setPicking] = useState(false)
  const [info, setInfo] = useState<LayoutInfo>({ generations: 0, people: 0 })
  const selected = personId && graph ? graph.people.get(personId) ?? null : null
  const canEdit = useCanEdit()

  useEffect(() => { if (personId && graph) requestAnimationFrame(() => canvas.current?.zoomTo(personId)) }, [personId, graph])
  const select = (id: string | null) => nav(id ? `/trees/${treeId}/chart/${id}` : `/trees/${treeId}/chart`, { replace: true })

  if (!data || !graph) return <p className="p-6 text-ink-mute">Loading…</p>
  if (data.people.length === 0)
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="card max-w-md text-center text-ink-mute">
          <p className="mb-3">The map is empty because there are no people yet.</p>
          {canEdit && <Link to={`/trees/${treeId}/people`} className="btn-primary">Add the first person</Link>}
        </div>
      </div>
    )

  const words = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
  const ctl = 'flex h-9 w-9 items-center justify-center hover:bg-paper'

  return (
    <div className="relative h-full overflow-hidden">
      <style>{`@keyframes riseIn { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
      <TreeCanvas graph={graph} selectedId={selected?.id ?? null} onSelect={select} handleRef={canvas} onLayout={setInfo} />

      {/* Title block */}
      <div className="pointer-events-none absolute top-4 left-4 sm:top-6 sm:left-8 z-10 grid gap-0.5 max-w-[60%]">
        <span className="truncate text-[19px] sm:text-[24px] leading-tight text-ink">{tree?.name ?? ''}</span>
        <span className="text-[11px] sm:text-[12px] uppercase tracking-[.08em] text-brass">{words[info.generations] ?? info.generations} generation{info.generations === 1 ? '' : 's'} · {info.people} {info.people === 1 ? 'person' : 'people'}</span>
      </div>

      {/* Find */}
      <button className="absolute top-4 right-4 sm:top-6 sm:right-8 z-10 flex h-9 w-9 sm:w-[240px] items-center justify-center sm:justify-start gap-2 rounded border border-line bg-white sm:px-3 text-[14px] italic text-ink-mute hover:border-moss" onClick={() => setPicking(true)} aria-label="Find a relative">
        <Search size={15} /> <span className="hidden sm:inline">Find a relative</span>
      </button>

      <p className="pointer-events-none absolute bottom-7 left-1/2 z-10 hidden -translate-x-1/2 text-[13px] italic text-ink-mute sm:block">Drag to explore · Scroll to zoom</p>

      {/* Zoom controls, above the minimap */}
      <div className={`absolute right-4 bottom-4 sm:right-8 sm:bottom-[160px] z-10 flex overflow-hidden rounded border border-line bg-white text-ink ${selected ? "hidden sm:flex" : ""}`}>
        <button className={`${ctl} border-r border-line`} title="Fit whole family" onClick={() => { select(null); canvas.current?.fit() }}><User size={16} className="text-moss" /></button>
        <button className={`${ctl} border-r border-line`} title="Zoom out" onClick={() => canvas.current?.zoomBy(1 / 1.4)}><Minus size={16} /></button>
        <button className={ctl} title="Zoom in" onClick={() => canvas.current?.zoomBy(1.4)}><Plus size={16} /></button>
      </div>

      {selected && (
        <PersonSpotlight person={selected} graph={graph} treeId={treeId} onClose={() => select(null)} onJump={select} onAddRelative={canEdit ? () => nav(`/trees/${treeId}/people/${selected.id}`) : undefined} />
      )}
      {picking && (
        <Modal title="Find a relative" onClose={() => setPicking(false)}>
          <PersonPicker people={data.people} onPick={(p) => { setPicking(false); select(p.id) }} />
        </Modal>
      )}
    </div>
  )
}
