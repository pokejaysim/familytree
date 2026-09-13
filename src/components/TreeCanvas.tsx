import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { hierarchy, tree as d3tree } from 'd3-hierarchy'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import 'd3-transition'
import { easeCubicInOut } from 'd3-ease'
import type { Graph } from '../lib/graph'
import type { Family, Person } from '../lib/types'
import { lifespan } from '../lib/dates'
import { useSignedUrl } from '../lib/queries'

/**
 * Infinite-canvas family map in the Kinfolk style (design option 7a):
 * compact 160×56 cards, one soft disc tint per generation, orthogonal sage connectors,
 * a brass line to the selected person, and a minimap.
 *
 * Branches fold: every couple with children carries a small toggle under the card. Folded
 * branches show a "+N" pill with the number of hidden relatives. Folds are remembered per
 * device and unfold automatically when someone inside is searched for.
 */

interface CoupleNode { id: string; a: Person | null; b: Person | null; others?: Person[]; children?: CoupleNode[]; kids?: number; hidden?: number } // a === null: invisible root that groups siblings whose parents are unknown; others = further spouses of a, drawn as small cards beneath
interface Placed { id: string; a: Person | null; b: Person | null; others: Person[]; x: number; y: number; depth: number; parentId: string | null; ghost: boolean; kids: number; hidden: number }

export const CARD_W = 160, CARD_H = 56
const MINI_W = 150, MINI_H = 40, MINI_GAP = 6
const COUPLE_GAP = 20, NODE_GAP_X = 40, ROW_GAP = 104
const nodeWidth = (n: { b: Person | null }) => (n.b ? CARD_W * 2 + COUPLE_GAP : CARD_W)

/** Generation tints, cycling: sage, honey, clay, sky. */
export const TINTS = [
  { bg: '#DCE8DD', ink: '#2E4A38' },
  { bg: '#F6E7C6', ink: '#7A5A12' },
  { bg: '#F1DCD0', ink: '#7A4A32' },
  { bg: '#DCE6EC', ink: '#2F4A5C' },
]

export interface TreeCanvasHandle { zoomTo: (personId: string) => void; fit: (animate?: boolean) => void; zoomBy: (k: number) => void; expandAll: () => void; collapseAll: () => void }
export interface LayoutInfo { generations: number; people: number; collapsed: number }

const countPeople = (n: CoupleNode): number => (n.a ? 1 : 0) + (n.b ? 1 : 0) + (n.others?.length ?? 0) + (n.children ?? []).reduce((s, c) => s + countPeople(c), 0)

export default function TreeCanvas({
  graph, treeId, selectedId, onSelect, handleRef, onLayout,
}: {
  graph: Graph
  treeId?: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  handleRef: React.MutableRefObject<TreeCanvasHandle | null>
  onLayout?: (info: LayoutInfo) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [t, setT] = useState<ZoomTransform>(zoomIdentity)
  const tRef = useRef<ZoomTransform>(zoomIdentity)
  const [size, setSize] = useState({ w: 1, h: 1 })
  const fittedRef = useRef(false)
  const fitRef = useRef<((animate?: boolean) => void) | null>(null)
  const zoomToRef = useRef<((personId: string) => void) | null>(null)
  const anchorRef = useRef<{ id: string; x: number; y: number } | null>(null) // couple to keep still on screen across a fold/unfold
  const pendingZoomRef = useRef<string | null>(null) // person to zoom to once their branch has unfolded
  const fitAfterRef = useRef(false) // fit the whole map once the next layout lands (fold all / unfold all)

  // ---- Folded branches, remembered per device ----
  const storageKey = treeId ? `sft-collapsed:${treeId}` : null
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try { const raw = storageKey && localStorage.getItem(storageKey); return new Set(raw ? (JSON.parse(raw) as string[]) : []) } catch { return new Set() }
  })
  const updateCollapsed = useCallback((next: Set<string>) => {
    setCollapsed(next)
    try { if (storageKey) localStorage.setItem(storageKey, JSON.stringify([...next])) } catch { /* storage unavailable: folds last for this visit only */ }
  }, [storageKey])

  // ---- Forest of couple-nodes; roots are people with no recorded parents ----
  const forest = useMemo(() => {
    const seen = new Set<string>()
    const build = (p: Person): CoupleNode => {
      seen.add(p.id)
      const fams = graph.familiesOfParent.get(p.id) ?? []
      // With several marriages, show the partner whose family has children beside the person; other partners stay on the profile page
      // (unless they have descendants of their own elsewhere, in which case they get their own place on the map).
      const kidsOf = (f: Family) => graph.childrenOfFamily.get(f.id)?.length ?? 0
      const ranked = [...fams].sort((a, b) => kidsOf(b) - kidsOf(a))
      const partner = ranked.map((f) => graph.partnerOf(f, p.id)).find((q) => q && !seen.has(q.id)) ?? null
      if (partner) seen.add(partner.id)
      const others: Person[] = []
      for (const f of fams) {
        const q = graph.partnerOf(f, p.id)
        if (q && q.id !== partner?.id && !seen.has(q.id) && (graph.familiesOfParent.get(q.id) ?? []).every((g) => g.id === f.id || kidsOf(g) === 0)) { seen.add(q.id); others.push(q) }
      }
      const kids = fams.flatMap((f) => graph.childrenOfFamily.get(f.id) ?? []).filter((k) => !seen.has(k.id))
      return { id: p.id, a: p, b: partner, others, children: kids.map(build) }
    }
    const people = [...graph.people.values()].sort((a, b) => (a.birth_date_sort ?? '9999').localeCompare(b.birth_date_sort ?? '9999'))
    const roots: CoupleNode[] = []
    const usedFams = new Set<string>()
    for (const p of people) {
      if (seen.has(p.id) || graph.parentsOf(p.id).length !== 0) continue
      // Siblings recorded under a family with no known parents: group them under an invisible root, in birth order.
      const sibFam = (graph.familiesOfChild.get(p.id) ?? []).find((f) => !f.partner1_id && !f.partner2_id)
      if (sibFam && !usedFams.has(sibFam.id)) {
        usedFams.add(sibFam.id)
        const sibs = (graph.childrenOfFamily.get(sibFam.id) ?? []).filter((s) => !seen.has(s.id))
        roots.push({ id: 'fam-' + sibFam.id, a: null, b: null, children: sibs.map(build) })
      } else if (!sibFam) roots.push(build(p))
    }
    for (const p of people) if (!seen.has(p.id)) roots.push(build(p))
    // For every person, the couple-nodes above them (so a search can unfold the way down to them).
    const chain = new Map<string, string[]>()
    const walk = (n: CoupleNode, anc: string[]) => {
      for (const p of [n.a, n.b, ...(n.others ?? [])]) if (p) chain.set(p.id, anc)
      for (const c of n.children ?? []) walk(c, [...anc, n.id])
    }
    roots.forEach((r) => walk(r, []))
    return { roots, chain }
  }, [graph])

  // ---- Layout of the forest with folded branches pruned ----
  const layout = useMemo(() => {
    const active = new Set<string>()
    const prune = (n: CoupleNode): CoupleNode => {
      const kids = n.children ?? []
      if (kids.length && collapsed.has(n.id)) { active.add(n.id); return { ...n, children: [], kids: kids.length, hidden: kids.reduce((s, c) => s + countPeople(c), 0) } }
      return { ...n, children: kids.map(prune), kids: kids.length, hidden: 0 }
    }
    const roots = forest.roots.map(prune)

    const all: Placed[] = []
    let offsetX = 0
    let maxDepth = 0
    for (const root of roots) {
      const ghostRoot = root.a === null
      const h = d3tree<CoupleNode>().nodeSize([1, CARD_H + ROW_GAP]).separation((a, b) => (nodeWidth(a.data) + nodeWidth(b.data)) / 2 + NODE_GAP_X)(hierarchy(root))
      const nodes = h.descendants()
      const minX = Math.min(...nodes.map((n) => n.x - nodeWidth(n.data) / 2))
      const lift = ghostRoot ? CARD_H + ROW_GAP : 0 // the ghost row is empty, so pull the subtree up one row
      for (const n of nodes) {
        const depth = n.depth - (ghostRoot ? 1 : 0)
        all.push({ id: n.data.id, a: n.data.a, b: n.data.b, others: n.data.others ?? [], x: n.x - minX + offsetX, y: n.y - lift, depth, parentId: n.parent?.data.id ?? null, ghost: n.data.a === null, kids: n.data.kids ?? 0, hidden: n.data.hidden ?? 0 })
        if (n.data.a) maxDepth = Math.max(maxDepth, depth)
      }
      offsetX += Math.max(...nodes.map((n) => n.x - minX + nodeWidth(n.data) / 2)) + NODE_GAP_X * 4
    }
    const placed = all.filter((p) => !p.ghost)
    const byId = new Map(all.map((p) => [p.id, p]))
    const cardPos = new Map<string, { x: number; y: number; depth: number }>()
    for (const p of placed) {
      if (p.b) {
        cardPos.set(p.a!.id, { x: p.x - (CARD_W + COUPLE_GAP) / 2, y: p.y, depth: p.depth })
        cardPos.set(p.b.id, { x: p.x + (CARD_W + COUPLE_GAP) / 2, y: p.y, depth: p.depth })
      } else cardPos.set(p.a!.id, { x: p.x, y: p.y, depth: p.depth })
      const ax = cardPos.get(p.a!.id)!.x
      p.others.forEach((q, i) => cardPos.set(q.id, { x: ax, y: p.y + CARD_H / 2 + MINI_GAP + MINI_H / 2 + i * (MINI_H + 4), depth: p.depth }))
    }
    // Orthogonal connectors: parent couple → bus line → each child. Under a ghost root there is no parent stem, just the bus.
    const edges = placed.filter((p) => p.parentId).map((c) => {
      const par = byId.get(c.parentId!)!
      const midY = par.y + CARD_H / 2 + ROW_GAP / 2
      const childIds = c.b ? [c.a!.id, c.b.id] : [c.a!.id]
      if (par.ghost) return { id: c.id, d: `M${c.x},${midY} V${c.y - CARD_H / 2}`, childIds }
      return { id: c.id, d: `M${par.x},${par.y + CARD_H / 2} V${midY} H${c.x} V${c.y - CARD_H / 2}`, childIds }
    })
    for (const g of all.filter((p) => p.ghost)) {
      const kids = placed.filter((p) => p.parentId === g.id)
      if (kids.length > 1) {
        const midY = g.y + CARD_H / 2 + ROW_GAP / 2
        edges.push({ id: 'bus-' + g.id, d: `M${Math.min(...kids.map((k) => k.x))},${midY} H${Math.max(...kids.map((k) => k.x))}`, childIds: [] })
      }
    }
    const xs = placed.flatMap((p) => [p.x - nodeWidth(p) / 2, p.x + nodeWidth(p) / 2])
    const ys = placed.flatMap((p) => [p.y - CARD_H / 2 - ROW_GAP / 2, p.y + CARD_H / 2 + (p.hidden ? 30 : 0)])
    const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
    return { placed, edges, bounds, cardPos, generations: maxDepth + 1, collapsed: active.size }
  }, [forest, collapsed])

  useEffect(() => { onLayout?.({ generations: layout.generations, people: graph.people.size, collapsed: layout.collapsed }) }, [layout, graph, onLayout])

  // ---- Zoom behaviour + resize tracking ----
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const z = zoom<SVGSVGElement, unknown>().scaleExtent([0.08, 3]).on('zoom', (ev) => { tRef.current = ev.transform; setT(ev.transform) })
    zoomRef.current = z
    select(svg).call(z).on('dblclick.zoom', null)
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
      if (!fittedRef.current && r.width > 0) { fittedRef.current = true; fitRef.current?.(false) } // first paint: jump straight to the fitted view
    })
    ro.observe(svg)
    return () => { select(svg).on('.zoom', null); ro.disconnect() }
  }, [])

  const animateTo = useCallback((tr: ZoomTransform, ms = 700) => {
    const svg = svgRef.current, z = zoomRef.current
    if (!svg || !z) return
    if (ms <= 0) { select(svg).call(z.transform, tr); return } // synchronous: cannot be lost to an interrupted transition
    select(svg).transition().duration(ms).ease(easeCubicInOut).call(z.transform, tr)
  }, [])

  const fit = useCallback((animate = true) => {
    const svg = svgRef.current
    if (!svg) return
    const ms = animate ? 700 : 0
    const { width, height } = svg.getBoundingClientRect()
    const { minX, maxX, minY, maxY } = layout.bounds
    // leave headroom for the title block (top) and spotlight card (bottom-left)
    const phone = width < 640
    const fitK = 0.78 * Math.min(width / (maxX - minX + 120), (height - 120) / (maxY - minY + 80))
    const minK = phone ? 0.5 : 0.3 // never open so far out that cards turn into dots; show the first generation readably instead
    const k = Math.min(1, Math.max(fitK, minK))
    if (fitK >= minK) animateTo(zoomIdentity.translate(width / 2 - ((minX + maxX) / 2) * k, 90 + (height - 120) / 2 - ((minY + maxY) / 2) * k).scale(k), ms)
    else animateTo(zoomIdentity.translate(width / 2 - ((minX + maxX) / 2) * k, (phone ? 150 : 110) - minY * k).scale(k), ms)
  }, [layout, animateTo])
  fitRef.current = fit

  const zoomTo = useCallback((personId: string) => {
    // Inside a folded branch? Unfold the way down first; the layout effect finishes the zoom.
    const need = (forest.chain.get(personId) ?? []).filter((id) => collapsed.has(id))
    if (need.length) {
      pendingZoomRef.current = personId
      const next = new Set(collapsed); need.forEach((id) => next.delete(id)); updateCollapsed(next)
      return
    }
    const svg = svgRef.current
    const pos = layout.cardPos.get(personId)
    if (!svg || !pos) return
    const { width, height } = svg.getBoundingClientRect()
    const phone = width < 640
    const k = phone ? 1.2 : 1.4
    animateTo(zoomIdentity.translate(width / 2 - pos.x * k, height * (phone ? 0.22 : 0.42) - pos.y * k).scale(k))
  }, [layout, forest, collapsed, updateCollapsed, animateTo])
  zoomToRef.current = zoomTo

  const zoomBy = useCallback((f: number) => {
    const svg = svgRef.current, z = zoomRef.current
    if (!svg || !z) return
    select(svg).transition().duration(220).call(z.scaleBy, f)
  }, [])

  const toggle = useCallback((n: Placed) => {
    anchorRef.current = { id: n.id, x: n.x, y: n.y }
    const next = new Set(collapsed)
    if (next.has(n.id)) next.delete(n.id); else next.add(n.id)
    updateCollapsed(next)
  }, [collapsed, updateCollapsed])

  const expandAll = useCallback(() => { fitAfterRef.current = true; updateCollapsed(new Set()) }, [updateCollapsed])
  /** Fold every branch below the first generation: the founding couple and their children stay, everyone else waits behind a "+N" pill. */
  const collapseAll = useCallback(() => {
    const next = new Set<string>()
    const walk = (n: CoupleNode, depth: number) => {
      if (depth >= 1 && n.children?.length) next.add(n.id)
      for (const c of n.children ?? []) walk(c, depth + 1)
    }
    for (const r of forest.roots) { if (r.a === null) (r.children ?? []).forEach((c) => walk(c, 0)); else walk(r, 0) }
    fitAfterRef.current = true
    updateCollapsed(next)
  }, [forest, updateCollapsed])

  useEffect(() => { handleRef.current = { zoomTo, fit, zoomBy, expandAll, collapseAll } }, [handleRef, zoomTo, fit, zoomBy, expandAll, collapseAll])

  // Re-fit when people are added or removed (not on every refetch, and not on folds).
  const peopleCountRef = useRef(graph.people.size)
  useEffect(() => {
    if (peopleCountRef.current === graph.people.size) return
    peopleCountRef.current = graph.people.size
    if (fittedRef.current) fitRef.current?.()
  }, [graph])

  // After a fold/unfold the layout shifts; keep the toggled couple where it was on screen, or finish a pending zoom/fit.
  useLayoutEffect(() => {
    if (pendingZoomRef.current) { const id = pendingZoomRef.current; pendingZoomRef.current = null; anchorRef.current = null; zoomToRef.current?.(id); return }
    if (fitAfterRef.current) { fitAfterRef.current = false; anchorRef.current = null; fitRef.current?.(); return }
    const a = anchorRef.current
    anchorRef.current = null
    const svg = svgRef.current, z = zoomRef.current
    if (!a || !svg || !z) return
    const n = layout.placed.find((p) => p.id === a.id)
    if (!n) return
    const cur = tRef.current, dx = n.x - a.x, dy = n.y - a.y
    if (dx || dy) select(svg).call(z.transform, zoomIdentity.translate(cur.x - dx * cur.k, cur.y - dy * cur.k).scale(cur.k))
  }, [layout])

  const dots = t.k < 0.22
  const selectedEdge = selectedId ? layout.edges.find((e) => e.childIds.includes(selectedId))?.id : null

  // ---- Minimap geometry ----
  const MM_W = 200, MM_H = 120
  const { minX, maxX, minY, maxY } = layout.bounds
  const mmK = Math.min((MM_W - 24) / Math.max(1, maxX - minX), (MM_H - 24) / Math.max(1, maxY - minY))
  const mmOk = Number.isFinite(mmK) && Number.isFinite(t.k) && t.k > 0 && size.w > 1
  const mmX = (x: number) => 12 + (x - minX) * mmK + ((MM_W - 24) - (maxX - minX) * mmK) / 2
  const mmY = (y: number) => 12 + (y - minY) * mmK + ((MM_H - 24) - (maxY - minY) * mmK) / 2
  const view = { x: mmX((0 - t.x) / t.k), y: mmY((0 - t.y) / t.k), w: (size.w / t.k) * mmK, h: (size.h / t.k) * mmK }

  return (
    <div className="relative h-full w-full">
      <svg ref={svgRef} className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing" style={{ background: '#FAF8F3' }} onClick={() => onSelect(null)}>
        <defs><clipPath id="disc"><circle cx={0} cy={0} r={17} /></clipPath><clipPath id="disc-sm"><circle cx={0} cy={0} r={12} /></clipPath></defs>
        <g transform={t.toString()}>
          {layout.edges.map((e) => (
            <path key={e.id} d={e.d} fill="none" stroke={e.id === selectedEdge ? '#A8843A' : '#B9C7B9'} strokeWidth={dots ? 4 : e.id === selectedEdge ? 1.5 : 1} />
          ))}
          {layout.placed.map((n) => (
            <g key={n.id}>
              {n.b && <line x1={n.x - COUPLE_GAP / 2 - 2} y1={n.y} x2={n.x + COUPLE_GAP / 2 + 2} y2={n.y} stroke="#B9C7B9" strokeWidth={dots ? 4 : 1} />}
              <PersonCard person={n.a!} x={layout.cardPos.get(n.a!.id)!.x} y={n.y} depth={n.depth} dots={dots} selected={selectedId === n.a!.id} onSelect={onSelect} />
              {n.b && <PersonCard person={n.b} x={layout.cardPos.get(n.b.id)!.x} y={n.y} depth={n.depth} dots={dots} selected={selectedId === n.b.id} onSelect={onSelect} />}
              {!dots && n.others.map((q) => <MiniCard key={q.id} person={q} x={layout.cardPos.get(q.id)!.x} y={layout.cardPos.get(q.id)!.y} selected={selectedId === q.id} onSelect={onSelect} />)}
              {n.kids > 0 && <FoldToggle x={n.x} y={n.y + CARD_H / 2} kids={n.kids} hidden={n.hidden} dots={dots} onToggle={() => toggle(n)} />}
            </g>
          ))}
        </g>
      </svg>

      {/* Minimap (bottom-right, below the zoom controls the page renders) */}
      <svg width={MM_W} height={MM_H} className="absolute right-8 bottom-7 hidden rounded border border-line bg-white sm:block" style={{ pointerEvents: 'none' }}>
        {mmOk && layout.placed.map((n) => (
          <rect key={n.id} x={mmX(n.x - nodeWidth(n) / 2)} y={mmY(n.y - CARD_H / 2)} width={Math.max(2, nodeWidth(n) * mmK)} height={Math.max(2, CARD_H * mmK)} rx={1} fill={n.a!.id === selectedId || n.b?.id === selectedId ? '#2E4A38' : '#D6D0C2'} />
        ))}
        {mmOk && <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="none" stroke="#2E4A38" strokeWidth={1} rx={2} />}
      </svg>
    </div>
  )
}

/** Fold control under a couple with children: a "−" on the stem while open, a "+N" pill (N hidden relatives) while folded. */
function FoldToggle({ x, y, kids, hidden, dots, onToggle }: { x: number; y: number; kids: number; hidden: number; dots: boolean; onToggle: () => void }) {
  const stop = (e: React.MouseEvent) => { e.stopPropagation(); onToggle() }
  if (hidden) {
    const label = `+${hidden}`
    const w = 18 + label.length * 8
    const s = dots ? 2.4 : 1 // stay legible when the map is zoomed out to dots
    const cy = y + (dots ? 34 : 18)
    return (
      <g className="cursor-pointer" onClick={stop}>
        <title>{`Show ${hidden} hidden relative${hidden === 1 ? '' : 's'}`}</title>
        <line x1={x} y1={y} x2={x} y2={cy - 10 * s} stroke="#B9C7B9" strokeWidth={dots ? 4 : 1} />
        <g transform={`translate(${x},${cy}) scale(${s})`}>
          <rect x={-w / 2} y={-10} width={w} height={20} rx={10} fill="#DCE8DD" stroke="#2E4A38" strokeWidth={1} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={500} fill="#2E4A38">{label}</text>
        </g>
      </g>
    )
  }
  if (dots) return null
  return (
    <g transform={`translate(${x},${y + 16})`} className="cursor-pointer" onClick={stop}>
      <title>{`Hide ${kids === 1 ? 'this child' : `these ${kids} children`} and their families`}</title>
      <circle r={13} fill="transparent" />
      <circle r={8} fill="#fff" stroke="#B9C7B9" strokeWidth={1} />
      <line x1={-4} y1={0} x2={4} y2={0} stroke="#2E4A38" strokeWidth={1.5} />
    </g>
  )
}

function PersonCard({ person: p, x, y, depth, dots, selected, onSelect }: { person: Person; x: number; y: number; depth: number; dots: boolean; selected: boolean; onSelect: (id: string) => void }) {
  const { data: photo } = useSignedUrl(p.photo_path)
  const tint = TINTS[depth % TINTS.length]
  const initials = `${p.given_names[0] ?? ''}${p.surname[0] ?? ''}`.toUpperCase() || '?'
  const stop = (e: React.MouseEvent) => { e.stopPropagation(); onSelect(p.id) }
  const left = x - CARD_W / 2, top = y - CARD_H / 2

  if (dots)
    return <circle cx={x} cy={y} r={selected ? 34 : 26} fill={selected ? '#2E4A38' : tint.bg} stroke={selected ? '#2E4A38' : tint.ink} strokeWidth={3} className="cursor-pointer" onClick={stop} />

  const first = p.nickname ? p.nickname : p.given_names.split(' ')[0] || p.surname || '?'
  return (
    <g transform={`translate(${left},${top})`} className="cursor-pointer" onClick={stop}>
      <rect width={CARD_W} height={CARD_H} rx={6} fill={selected ? '#2E4A38' : '#fff'} stroke={selected ? '#2E4A38' : '#E2DDD2'} strokeWidth={1} />
      <g transform={`translate(${10 + 17},${CARD_H / 2})`}>
        <circle r={17} fill={selected ? '#FAF8F3' : tint.bg} />
        {photo
          ? <image href={photo} x={-17} y={-17} width={34} height={34} preserveAspectRatio="xMidYMid slice" clipPath="url(#disc)" />
          : <text textAnchor="middle" dominantBaseline="central" fontSize={13} fill={selected ? '#2E4A38' : tint.ink}>{initials}</text>}
      </g>
      <text x={54} y={24} fontSize={15} fontWeight={selected ? 500 : 400} fill={selected ? '#FAF8F3' : '#2A2A26'}>{trunc(first, 12)}</text>
      <text x={54} y={41} fontSize={11} letterSpacing=".04em" fill={selected ? '#D6CFBF' : '#8A8578'}>{lifespan(p) || '—'}</text>
    </g>
  )
}

/** A further spouse (e.g. an earlier marriage), stacked beneath the person's own card. */
function MiniCard({ person: p, x, y, selected, onSelect }: { person: Person; x: number; y: number; selected: boolean; onSelect: (id: string) => void }) {
  const { data: photo } = useSignedUrl(p.photo_path)
  const initials = `${p.given_names[0] ?? ''}${p.surname[0] ?? ''}`.toUpperCase() || '?'
  const first = p.nickname ? p.nickname : p.given_names.split(' ')[0] || p.surname || '?'
  const left = x - MINI_W / 2, top = y - MINI_H / 2
  return (
    <g className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onSelect(p.id) }}>
      <line x1={x} y1={top - MINI_GAP} x2={x} y2={top} stroke="#C4B8A6" strokeWidth={1} />
      <rect x={left} y={top} width={MINI_W} height={MINI_H} rx={6} fill={selected ? '#2E4A38' : '#fff'} stroke={selected ? '#2E4A38' : '#C4B8A6'} strokeWidth={1} strokeDasharray={selected ? undefined : '3 2'} />
      <g transform={`translate(${left + 8 + 12},${y})`}>
        <circle r={12} fill={selected ? '#FAF8F3' : '#F6F3EE'} />
        {photo ? <image href={photo} x={-12} y={-12} width={24} height={24} preserveAspectRatio="xMidYMid slice" clipPath="url(#disc-sm)" />
          : <text textAnchor="middle" dominantBaseline="central" fontSize={10} fill="#6B5D4D">{initials}</text>}
      </g>
      <text x={left + 36} y={y - 2} fontSize={12} fill={selected ? '#FAF8F3' : '#2A2A26'}>{trunc(first, 14)}</text>
      <text x={left + 36} y={y + 11} fontSize={9.5} letterSpacing=".04em" fill={selected ? '#D6CFBF' : '#8A8578'}>{lifespan(p) || 'm.'}</text>
    </g>
  )
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
