import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDownFromLine, ArrowRightFromLine, BookOpen, ArrowUpToLine, ChevronsDownUp, ChevronsUpDown, Minus, Plus, Search, UserRound } from 'lucide-react'
import { useTree, useTreeData } from '../lib/queries'
import { buildGraph } from '../lib/graph'
import TreeCanvas, { type LayoutInfo, type Orient, type TreeCanvasHandle } from '../components/TreeCanvas'
import PersonSpotlight from '../components/PersonSpotlight'
import PersonPicker from '../components/PersonPicker'
import Modal from '../components/Modal'
import { useCanEdit, useIsAdmin, useMeId } from '../lib/profile'
import EmptyState from '../components/EmptyState'
import IntroPane from '../components/IntroPane'

export default function ChartPage() {
  const { treeId = '', personId } = useParams()
  const nav = useNavigate()
  const { data } = useTreeData(treeId)
  const { data: tree } = useTree(treeId)
  const graph = useMemo(() => (data ? buildGraph(data) : null), [data])
  const canvas = useRef<TreeCanvasHandle | null>(null)
  const [picking, setPicking] = useState(false)
  const [info, setInfo] = useState<LayoutInfo>({ generations: 0, people: 0, collapsed: 0 })
  const [introOpen, setIntroOpen] = useState(false)
  // Map orientation: the book's top-down chart on wide screens; generations flowing left to right (siblings stacked) on phones. Remembered per device once chosen.
  const [orient, setOrient] = useState<Orient>(() => {
    try { const s = localStorage.getItem('sft-orient'); if (s === 'down' || s === 'right') return s } catch { /* ignore */ }
    return window.innerHeight > window.innerWidth ? 'right' : 'down' // a screen held upright (phones, tablets in portrait) gets the tall shape
  })
  const turn = () => { const next: Orient = orient === 'down' ? 'right' : 'down'; setOrient(next); try { localStorage.setItem('sft-orient', next) } catch { /* ignore */ } }

  // The foreword opens from the note on the map (and the home page's Getting started card); it no longer pops up by itself.
  const selected = personId && graph ? graph.people.get(personId) ?? null : null
  const canEdit = useCanEdit()
  const isAdmin = useIsAdmin()
  const myId = useMeId()
  const meId = myId && graph?.people.has(myId) ? myId : null

  useEffect(() => { if (personId && graph) requestAnimationFrame(() => canvas.current?.zoomTo(personId)) }, [personId, graph])

  const select = (id: string | null) => nav(id ? `/trees/${treeId}/chart/${id}` : `/trees/${treeId}/chart`, { replace: true })

  if (!data || !graph) return <p className="p-6 text-ink-mute">Loading…</p>
  if (data.people.length === 0)
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md">
          <EmptyState art="first-branch" title="No one on the map yet." text="Add the first person, and the map grows as you add their parents, partners and children." action={canEdit ? { label: 'Add your first relative', onClick: () => nav(`/trees/${treeId}/people`) } : undefined} />
        </div>
      </div>
    )

  const words = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
  const ctl = 'flex h-9 w-9 items-center justify-center hover:bg-paper'

  return (
    <div className="relative h-full overflow-hidden">
      <style>{`@keyframes riseIn { from { transform: translateY(12px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
      <TreeCanvas graph={graph} treeId={treeId} orient={orient} selectedId={selected?.id ?? null} meId={meId} startId={personId ? null : meId} onSelect={select} handleRef={canvas} onLayout={setInfo} />

      {/* Title block, on its own paper so connectors never run behind the words */}
      <div className="pointer-events-none absolute top-3 left-3 z-10 grid max-w-[60%] gap-0.5 rounded-md bg-paper/95 px-2 py-1 sm:top-5 sm:left-6">
        <h1 className="truncate text-[20px] leading-tight text-ink sm:text-[24px]">{tree?.name ?? ''}</h1>
        <p className="text-[14px] text-ink-mute sm:text-[15px]">{info.people} {info.people === 1 ? 'person' : 'people'} across {(words[info.generations] ?? String(info.generations)).toLowerCase()} generation{info.generations === 1 ? '' : 's'}</p>
      </div>

      {/* Preface note */}
      {(tree?.intro || tree?.foreword) && (
        <button onClick={() => setIntroOpen(true)} className="absolute top-[72px] left-4 z-10 flex items-center gap-2.5 rounded border border-line bg-white px-3 py-2 text-left shadow-float transition-colors hover:border-moss sm:top-[96px] sm:left-8 sm:px-4 sm:py-3">
          <BookOpen size={18} className="shrink-0 text-moss" />
          <span className="grid gap-0.5 leading-tight">
            <span className="text-[16px]">{tree.foreword && tree.intro ? 'Foreword & Preface' : tree.foreword ? (tree.foreword_title || 'Foreword') : (tree.intro_title || 'Introduction')}</span>
            {[tree.foreword_byline, tree.intro_byline].filter(Boolean).map((b) => <span key={b} className="hidden text-[14px] italic text-ink-mute sm:block">{b}</span>)}
          </span>
          <span className="ml-2 hidden text-[15px] text-brass sm:inline">Read</span>
        </button>
      )}

      {/* Find */}
      <button className="absolute top-4 right-4 sm:top-6 sm:right-8 z-10 flex h-9 w-9 sm:w-[240px] items-center justify-center sm:justify-start gap-2 rounded border border-line bg-white sm:px-3 text-[14px] italic text-ink-mute hover:border-moss" onClick={() => setPicking(true)} aria-label="Find a relative">
        <Search size={15} /> <span className="hidden sm:inline">Find a relative</span>
      </button>

      <p className="pointer-events-none absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-paper/95 px-2 py-0.5 text-[14px] italic text-ink-mute sm:block">Drag to explore, scroll to zoom, and fold a branch with the − under a couple.</p>

      {/* Zoom controls, above the minimap */}
      <div className={`absolute right-4 bottom-4 sm:right-8 sm:bottom-[160px] z-10 flex overflow-hidden rounded border border-line bg-white text-ink ${selected ? "hidden sm:flex" : ""}`}>
        <button className={`${ctl} border-r border-line`} title={orient === 'down' ? 'Turn the map: generations left to right' : 'Turn the map: generations top to bottom'} onClick={() => { select(null); turn() }}>{orient === 'down' ? <ArrowRightFromLine size={16} /> : <ArrowDownFromLine size={16} />}</button>
        {info.collapsed > 0
          ? <button className={`${ctl} border-r border-line`} title={`Unfold all branches (${info.collapsed} folded)`} onClick={() => { select(null); canvas.current?.expandAll() }}><ChevronsUpDown size={16} /></button>
          : <button className={`${ctl} border-r border-line`} title="Fold every branch below the first generation" onClick={() => { select(null); canvas.current?.collapseAll() }}><ChevronsDownUp size={16} /></button>}
        {meId && <button className={`${ctl} border-r border-line`} title="Show me on the map" aria-label="Show me on the map" onClick={() => { select(null); if (orient === 'down') canvas.current?.zoomTo(meId, window.innerWidth < 640 ? 0.8 : 0.85, 0.62); else canvas.current?.zoomTo(meId, 0.8, 0.4, undefined, Math.max(0.5, 1 - 80 / window.innerWidth)) }}><UserRound size={16} className="text-brass" /></button>}
        <button className={`${ctl} border-r border-line`} title="Go to the top of the tree" aria-label="Go to the top of the tree" onClick={() => { select(null); canvas.current?.fit() }}><ArrowUpToLine size={16} className="text-moss" /></button>
        <button className={`${ctl} border-r border-line`} title="Zoom out" onClick={() => canvas.current?.zoomBy(1 / 1.4)}><Minus size={16} /></button>
        <button className={ctl} title="Zoom in" onClick={() => canvas.current?.zoomBy(1.4)}><Plus size={16} /></button>
      </div>

      {selected && (
        <PersonSpotlight person={selected} graph={graph} treeId={treeId} onClose={() => select(null)} onJump={select} onAddRelative={canEdit ? () => nav(`/trees/${treeId}/people/${selected.id}`) : undefined} />
      )}
      {introOpen && tree && <IntroPane tree={tree} canEdit={isAdmin} onClose={() => setIntroOpen(false)} />}
      {picking && (
        <Modal title="Find a relative" onClose={() => setPicking(false)}>
          <PersonPicker people={data.people} onPick={(p) => { setPicking(false); select(p.id) }} />
        </Modal>
      )}
    </div>
  )
}
