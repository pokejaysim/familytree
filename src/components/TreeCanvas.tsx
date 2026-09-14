import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { hierarchy, tree as d3tree } from 'd3-hierarchy'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import 'd3-transition'
import { easeCubicInOut, easeCubicOut } from 'd3-ease'
import type { Graph } from '../lib/graph'
import type { Family, Person } from '../lib/types'
import { lifespan } from '../lib/dates'
import { useSignedUrl } from '../lib/queries'

/**
 * Infinite-canvas family map in the Kinfolk style (design option 7a):
 * compact 160×56 cards, one soft disc tint per generation, orthogonal sage connectors,
 * a brass line to the selected person, and a minimap.
 *
 * Two orientations. `down`: generations are rows and a couple sits side by side (the book's chart).
 * `right`: generations are columns, siblings stack downward and a couple sits one above the other —
 * a tall, narrow shape that suits a phone held upright. The layout is computed on a generation axis
 * ("main") and a sibling axis ("cross") and then mapped to x/y, so both orientations share one code path.
 *
 * Branches fold: every couple with children carries a small toggle. Folded branches show a "+N" pill
 * with the number of hidden relatives. Folds are remembered per device and unfold automatically when
 * someone inside is searched for.
 *
 * Motion: cards glide between layouts (CSS transitions on each node group), descendants gather
 * into the pill when folding and spread out from it generation by generation when unfolding,
 * connectors tween their paths (d3) or draw themselves in, and the pill pops.
 */

export type Orient = 'down' | 'right'

interface CoupleNode { id: string; a: Person | null; b: Person | null; others?: Person[]; children?: CoupleNode[]; kids?: number; hidden?: number; anc?: CoupleNode[] } // a === null: invisible root that groups siblings whose parents are unknown; others = further spouses of a, drawn as small cards beneath; anc = the partner's own ancestors (parents first), stacked before the partner's card
interface Placed { id: string; a: Person | null; b: Person | null; others: Person[]; x: number; y: number; depth: number; parentId: string | null; ghost: boolean; kids: number; hidden: number }
interface Shown extends Placed { rel: number; entering?: boolean; leaving?: boolean } // rel: generations below the couple the node emerges from / gathers into

export const CARD_W = 160, CARD_H = 56
const MINI_W = 150, MINI_H = 40, MINI_GAP = 6
const COUPLE_GAP = 20, COUPLE_GAP_V = 10, SIB_GAP_X = 40, SIB_GAP_Y = 22, GEN_GAP = 104
const MOVE_MS = 620, STAGGER_MS = 70
const EASE_CSS = 'cubic-bezier(.65,0,.35,1)' // ≈ easeCubicInOut, so connectors keep pace with the cards

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

type Edge = { id: string; d: string; childIds: string[] }
type Layout = { orient: Orient; placed: Placed[]; edges: Edge[]; bounds: { minX: number; maxX: number; minY: number; maxY: number }; cardPos: Map<string, { x: number; y: number; depth: number }>; focus: { x: number; y: number }; generations: number; collapsed: number }
type Diff = { layout: Layout | null; map: Map<string, Placed>; edges: Map<string, string>; prevEdges: Map<string, string> | null; entering: Map<string, { x: number; y: number; rel: number }>; leaving: Shown[]; leavingEdges: Edge[]; turned: boolean }

/** Geometry that depends on the orientation: card extents along the generation ("main") and sibling ("cross") axes, and the offsets of a couple's two cards. */
function geometry(orient: Orient) {
  const down = orient === 'down'
  const cardMain = down ? CARD_H : CARD_W, cardCross = down ? CARD_W : CARD_H
  const coupleGap = down ? COUPLE_GAP : COUPLE_GAP_V, sibGap = down ? SIB_GAP_X : SIB_GAP_Y
  const nodeCross = (n: { b: Person | null }) => (n.b ? cardCross * 2 + coupleGap : cardCross)
  const off = (cardCross + coupleGap) / 2 // distance from a couple's centre to each card's centre
  const toXY = (cross: number, main: number) => (down ? { x: cross, y: main } : { x: main, y: cross })
  const partner = (p: { x: number; y: number }, which: 'a' | 'b') => { const s = which === 'a' ? -off : off; return down ? { x: p.x + s, y: p.y } : { x: p.x, y: p.y + s } }
  return { down, cardMain, cardCross, coupleGap, sibGap, nodeCross, off, toXY, partner }
}

export default function TreeCanvas({
  graph, treeId, orient = 'down', selectedId, onSelect, handleRef, onLayout,
}: {
  graph: Graph
  treeId?: string
  orient?: Orient
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
  const fitAfterRef = useRef(false) // fit the whole map once the next layout lands (fold all / unfold all / orientation change)

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
    const kidsOf = (f: Family) => graph.childrenOfFamily.get(f.id)?.length ?? 0
    // A spouse's own line (parents, grandparents, …) as far as it is known and not already on the map. Drawn as a stack before the spouse.
    const climb = (p: Person): CoupleNode[] => {
      const chain: CoupleNode[] = []
      let cur: Person | null = p
      while (cur) {
        const par: Person[] = graph.parentsOf(cur.id).filter((q: Person) => !seen.has(q.id))
        if (par.length === 0) break
        par.forEach((q) => seen.add(q.id))
        chain.push({ id: par[0].id, a: par[0], b: par[1] ?? null, others: [], children: [] })
        cur = par[0]
      }
      return chain
    }
    const build = (p: Person): CoupleNode => {
      seen.add(p.id)
      const fams = graph.familiesOfParent.get(p.id) ?? []
      // With several marriages, show the partner whose family has children beside the person; other partners stay on the profile page
      // (unless they have descendants of their own elsewhere, in which case they get their own place on the map).
      const ranked = [...fams].sort((a, b) => kidsOf(b) - kidsOf(a))
      const partner = ranked.map((f) => graph.partnerOf(f, p.id)).find((q) => q && !seen.has(q.id)) ?? null
      if (partner) seen.add(partner.id)
      const anc = partner ? climb(partner) : []
      const others: Person[] = []
      for (const f of fams) {
        const q = graph.partnerOf(f, p.id)
        if (q && q.id !== partner?.id && !seen.has(q.id) && (graph.familiesOfParent.get(q.id) ?? []).every((g) => g.id === f.id || kidsOf(g) === 0)) { seen.add(q.id); others.push(q) }
      }
      const kids = fams.flatMap((f) => graph.childrenOfFamily.get(f.id) ?? []).filter((k) => !seen.has(k.id))
      return { id: p.id, a: p, b: partner, others, children: kids.map(build), anc }
    }
    // Roots are people with no recorded parents. The founding couple (most children) goes first, so a spouse's ancestors become a stack
    // beside the spouse rather than a rival tree; the rest follow in birth order.
    const kidCount = (p: Person) => (graph.familiesOfParent.get(p.id) ?? []).reduce((s, f) => s + kidsOf(f), 0)
    const people = [...graph.people.values()].sort((a, b) => (a.birth_date_sort ?? '9999').localeCompare(b.birth_date_sort ?? '9999'))
    const candidates = [...people].sort((a, b) => kidCount(b) - kidCount(a))
    const roots: CoupleNode[] = []
    const usedFams = new Set<string>()
    for (const p of candidates) {
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
  const layout = useMemo<Layout>(() => {
    const G = geometry(orient)
    const active = new Set<string>()
    const prune = (n: CoupleNode): CoupleNode => {
      const kids = n.children ?? []
      if (kids.length && collapsed.has(n.id)) { active.add(n.id); return { ...n, children: [], kids: kids.length, hidden: kids.reduce((s, c) => s + countPeople(c), 0) } }
      return { ...n, children: kids.map(prune), kids: kids.length, hidden: 0 }
    }
    const roots = forest.roots.map(prune)
    // Further spouses hang off the node along the cross axis in `right` orientation, so give them room between siblings there.
    const othersExtent = (n: CoupleNode) => (G.down || !n.others?.length ? 0 : MINI_GAP + n.others.length * (MINI_H + 4))

    const all: Placed[] = []
    let offset = 0 // along the cross axis, between separate trees
    let maxDepth = 0
    for (const root of roots) {
      const ghostRoot = root.a === null
      const h = d3tree<CoupleNode>().nodeSize([1, G.cardMain + GEN_GAP]).separation((a, b) => (G.nodeCross(a.data) + othersExtent(a.data) + G.nodeCross(b.data) + othersExtent(b.data)) / 2 + G.sibGap)(hierarchy(root))
      const nodes = h.descendants()
      const minCross = Math.min(...nodes.map((n) => n.x - G.nodeCross(n.data) / 2))
      const lift = ghostRoot ? G.cardMain + GEN_GAP : 0 // the ghost row is empty, so pull the subtree up one generation
      for (const n of nodes) {
        const depth = n.depth - (ghostRoot ? 1 : 0)
        const { x, y } = G.toXY(n.x - minCross + offset, n.y - lift)
        all.push({ id: n.data.id, a: n.data.a, b: n.data.b, others: n.data.others ?? [], x, y, depth, parentId: n.parent?.data.id ?? null, ghost: n.data.a === null, kids: n.data.kids ?? 0, hidden: n.data.hidden ?? 0 })
        if (n.data.a) maxDepth = Math.max(maxDepth, depth)
      }
      offset += Math.max(...nodes.map((n) => n.x - minCross + G.nodeCross(n.data) / 2 + othersExtent(n.data))) + G.sibGap * 4
    }
    const placed = all.filter((p) => !p.ghost)
    const byId = new Map(all.map((p) => [p.id, p]))
    const cardPos = new Map<string, { x: number; y: number; depth: number }>()
    for (const p of placed) {
      if (p.b) {
        const a = G.partner(p, 'a'), b = G.partner(p, 'b')
        cardPos.set(p.a!.id, { ...a, depth: p.depth }); cardPos.set(p.b.id, { ...b, depth: p.depth })
      } else cardPos.set(p.a!.id, { x: p.x, y: p.y, depth: p.depth })
      // Further spouses: beneath the person's card (down) or beneath the whole stack (right).
      const base = G.down ? { x: cardPos.get(p.a!.id)!.x, y: p.y + CARD_H / 2 } : { x: p.x, y: p.y + G.nodeCross(p) / 2 }
      p.others.forEach((q, i) => cardPos.set(q.id, { x: base.x, y: base.y + MINI_GAP + MINI_H / 2 + i * (MINI_H + 4), depth: p.depth }))
    }
    // A spouse's ancestors: a stack of generations before the spouse's card, each centred on the card of the person it is the parents of.
    const ancEdges: Edge[] = []
    const ancNodes = new Map<string, CoupleNode[]>()
    const collect = (n: CoupleNode) => { if (n.anc?.length && n.b) ancNodes.set(n.b.id, n.anc); n.children?.forEach(collect) }
    roots.forEach(collect)
    for (const p of [...placed]) {
      const chain = p.b ? ancNodes.get(p.b.id) : undefined
      if (!chain) continue
      let below: { x: number; y: number } = { x: cardPos.get(p.b!.id)!.x, y: cardPos.get(p.b!.id)!.y }, belowId = p.b!.id
      chain.forEach((n, i) => {
        const pos = G.down ? { x: below.x, y: below.y - (CARD_H + GEN_GAP) } : { x: below.x - (CARD_W + GEN_GAP), y: below.y }
        const node: Placed = { id: n.id, a: n.a, b: n.b, others: [], x: pos.x, y: pos.y, depth: p.depth - (i + 1), parentId: null, ghost: false, kids: 0, hidden: 0 }
        placed.push(node)
        const a = n.b ? G.partner(pos, 'a') : pos
        cardPos.set(n.a!.id, { ...a, depth: node.depth })
        if (n.b) cardPos.set(n.b.id, { ...G.partner(pos, 'b'), depth: node.depth })
        ancEdges.push({ id: 'anc-' + n.id, d: G.down ? `M${pos.x},${pos.y + CARD_H / 2} V${below.y - CARD_H / 2}` : `M${pos.x + CARD_W / 2},${pos.y} H${below.x - CARD_W / 2}`, childIds: [belowId] })
        below = a; belowId = n.a!.id
      })
    }
    // Orthogonal connectors: parent couple → bus line → each child. Under a ghost root there is no parent stem, just the bus.
    const edges: Edge[] = placed.filter((p) => p.parentId).map((c) => {
      const par = byId.get(c.parentId!)!
      const childIds = c.b ? [c.a!.id, c.b.id] : [c.a!.id]
      if (G.down) {
        const midY = par.y + CARD_H / 2 + GEN_GAP / 2
        return { id: c.id, d: par.ghost ? `M${c.x},${midY} V${c.y - CARD_H / 2}` : `M${par.x},${par.y + CARD_H / 2} V${midY} H${c.x} V${c.y - CARD_H / 2}`, childIds }
      }
      const midX = par.x + CARD_W / 2 + GEN_GAP / 2
      return { id: c.id, d: par.ghost ? `M${midX},${c.y} H${c.x - CARD_W / 2}` : `M${par.x + CARD_W / 2},${par.y} H${midX} V${c.y} H${c.x - CARD_W / 2}`, childIds }
    })
    for (const g of all.filter((p) => p.ghost)) {
      const kids = placed.filter((p) => p.parentId === g.id)
      if (kids.length > 1) {
        if (G.down) { const midY = g.y + CARD_H / 2 + GEN_GAP / 2; edges.push({ id: 'bus-' + g.id, d: `M${Math.min(...kids.map((k) => k.x))},${midY} H${Math.max(...kids.map((k) => k.x))}`, childIds: [] }) }
        else { const midX = g.x + CARD_W / 2 + GEN_GAP / 2; edges.push({ id: 'bus-' + g.id, d: `M${midX},${Math.min(...kids.map((k) => k.y))} V${Math.max(...kids.map((k) => k.y))}`, childIds: [] }) }
      }
    }
    edges.push(...ancEdges)
    const xs = placed.flatMap((p) => G.down ? [p.x - G.nodeCross(p) / 2, p.x + G.nodeCross(p) / 2] : [p.x - CARD_W / 2 - GEN_GAP / 2, p.x + CARD_W / 2 + (p.hidden ? 80 : 0)])
    const ys = placed.flatMap((p) => G.down ? [p.y - CARD_H / 2 - GEN_GAP / 2, p.y + CARD_H / 2 + (p.hidden ? 30 : 0)] : [p.y - G.nodeCross(p) / 2, p.y + G.nodeCross(p) / 2 + othersExtent(p)])
    const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
    const root = placed.find((p) => p.depth === 0 && p.kids > 0) ?? placed.find((p) => p.depth === 0) ?? placed[0]
    const focus = root ? { x: root.x, y: root.y } : { x: 0, y: 0 }
    return { orient, placed, edges, bounds, cardPos, focus, generations: maxDepth + 1, collapsed: active.size }
  }, [forest, collapsed, orient])

  useEffect(() => { onLayout?.({ generations: layout.generations, people: graph.people.size, collapsed: layout.collapsed }) }, [layout, graph, onLayout])

  // ---- What changed since the previous layout: who is arriving (and from where), who is leaving (and to where) ----
  const diffRef = useRef<Diff>({ layout: null, map: new Map(), edges: new Map(), prevEdges: null, entering: new Map(), leaving: [], leavingEdges: [], turned: false })
  const diff = useMemo<Diff>(() => {
    const c = diffRef.current
    if (c.layout === layout) return c
    const turned = !!c.layout && c.layout.orient !== layout.orient // orientation change: everything moves, so no gathering/emerging choreography
    const prevMap = c.map, newMap = new Map(layout.placed.map((n) => [n.id, n]))
    const entering = new Map<string, { x: number; y: number; rel: number }>()
    const leaving: Shown[] = []
    if (c.layout && !turned) {
      for (const n of layout.placed) {
        if (prevMap.has(n.id)) continue
        let p = n.parentId, rel = 1 // nearest ancestor that was already on the map: the new cards emerge from there
        while (p && !prevMap.has(p)) { p = newMap.get(p)?.parentId ?? null; rel++ }
        const anc = p ? newMap.get(p) : undefined
        if (anc) entering.set(n.id, { x: anc.x, y: anc.y, rel })
      }
      for (const o of prevMap.values()) {
        if (newMap.has(o.id)) continue
        let p = o.parentId, rel = 1 // nearest ancestor that stays: the departing cards gather there
        while (p && !newMap.has(p)) { p = prevMap.get(p)?.parentId ?? null; rel++ }
        const anc = p ? newMap.get(p) : undefined
        leaving.push({ ...o, x: anc ? anc.x : o.x, y: anc ? anc.y : o.y, leaving: true, rel })
      }
    }
    const edges = new Map(layout.edges.map((e) => [e.id, e.d]))
    const leavingEdges = c.layout && !turned ? c.layout.edges.filter((e) => !edges.has(e.id)) : []
    diffRef.current = { layout, map: newMap, edges, prevEdges: c.layout && !turned ? c.edges : null, entering, leaving, leavingEdges, turned }
    return diffRef.current
  }, [layout])
  const [settled, setSettled] = useState<Layout | null>(null) // once set to the current layout, arriving cards are drawn at their real places
  const [leavingDone, setLeavingDone] = useState<Layout | null>(null) // once set, departing cards are dropped
  const [edgesHidden, setEdgesHidden] = useState(false) // connectors sit out an orientation change while the cards glide

  // ---- Zoom behaviour + resize tracking ----
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const z = zoom<SVGSVGElement, unknown>().scaleExtent([0.08, 3]).on('zoom', (ev) => { tRef.current = ev.transform; setT(ev.transform) })
    zoomRef.current = z
    select(svg).call(z).on('dblclick.zoom', null)
    const firstFit = () => {
      const r = svg.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
      if (!fittedRef.current && r.width > 0) { fittedRef.current = true; fitRef.current?.(false) } // jump straight to the fitted view
    }
    firstFit() // before paint, so a deep link's zoomTo (which runs on the next frame) lands on top of it rather than under it
    const ro = new ResizeObserver(firstFit)
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
    const minK = phone ? 0.5 : 0.3 // never open so far out that cards turn into dots; show the founding couple readably instead
    const k = Math.min(1, Math.max(fitK, minK))
    if (fitK >= minK) animateTo(zoomIdentity.translate(width / 2 - ((minX + maxX) / 2) * k, 90 + (height - 120) / 2 - ((minY + maxY) / 2) * k).scale(k), ms)
    else if (layout.orient === 'down') animateTo(zoomIdentity.translate(width / 2 - ((minX + maxX) / 2) * k, (phone ? 150 : 110) - minY * k).scale(k), ms)
    else animateTo(zoomIdentity.translate(24 - (layout.focus.x - CARD_W / 2) * k, height * (phone ? 0.42 : 0.5) - layout.focus.y * k).scale(k), ms) // founding couple at the left edge, mid-height
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
    fittedRef.current = true // the map now has a deliberate view; a late first-fit (e.g. the canvas measuring after this) must not replace it
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

  // ---- Motion between layouts ----
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    if (diff.turned) { fitAfterRef.current = true; setEdgesHidden(true) } // turning the map: cards glide to the new shape, connectors return once they have settled
    // Arriving cards were just drawn at the couple they emerge from; resolve that style, then let the next render glide them home.
    if (diff.entering.size) { void svg.getBoundingClientRect(); setSettled(layout) }
    // Connectors: tween paths that moved, draw in the new ones (all edges of one orientation share a shape, so string interpolation is safe).
    if (diff.prevEdges) {
      for (const el of svg.querySelectorAll<SVGPathElement>('path[data-edge]')) {
        const id = el.dataset.edge!, nd = diff.edges.get(id), od = diff.prevEdges.get(id)
        if (!nd) continue
        if (od === undefined) {
          const rel = diff.entering.get(id)?.rel ?? 1
          select(el).attr('stroke-dasharray', '1').attr('stroke-dashoffset', '1')
            .transition('draw').delay(140 + (rel - 1) * STAGGER_MS).duration(520).ease(easeCubicOut).attr('stroke-dashoffset', '0')
            .on('end', () => { el.removeAttribute('stroke-dasharray'); el.removeAttribute('stroke-dashoffset') })
        } else if (od !== nd) {
          select(el).attr('d', od).transition('d').duration(MOVE_MS).ease(easeCubicInOut).attr('d', nd)
        }
      }
    }
    const timers: number[] = []
    if (diff.turned) timers.push(window.setTimeout(() => setEdgesHidden(false), MOVE_MS + 60))
    if (diff.leaving.length || diff.leavingEdges.length) timers.push(window.setTimeout(() => setLeavingDone(layout), MOVE_MS + 80))
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [layout, diff])

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

  const G = geometry(layout.orient)
  const dots = t.k < 0.22
  const selectedEdge = selectedId ? layout.edges.find((e) => e.childIds.includes(selectedId))?.id : null

  // Cards to draw: the layout's, with arrivals parked at their origin until settled, plus departures gliding to their gathering point.
  const arriving = settled !== layout
  const shown: Shown[] = layout.placed.map((n) => {
    const e = diff.entering.get(n.id)
    if (e && arriving) return { ...n, x: e.x, y: e.y, entering: true, rel: e.rel }
    return { ...n, rel: e?.rel ?? 0 }
  })
  if (leavingDone !== layout) shown.push(...diff.leaving)
  const edgesShown: (Edge & { leaving?: boolean })[] = leavingDone !== layout ? [...layout.edges, ...diff.leavingEdges.map((e) => ({ ...e, leaving: true }))] : layout.edges

  // ---- Minimap geometry ----
  const MM_W = 200, MM_H = 120
  const { minX, maxX, minY, maxY } = layout.bounds
  const mmK = Math.min((MM_W - 24) / Math.max(1, maxX - minX), (MM_H - 24) / Math.max(1, maxY - minY))
  const mmOk = Number.isFinite(mmK) && Number.isFinite(t.k) && t.k > 0 && size.w > 1
  const mmX = (x: number) => 12 + (x - minX) * mmK + ((MM_W - 24) - (maxX - minX) * mmK) / 2
  const mmY = (y: number) => 12 + (y - minY) * mmK + ((MM_H - 24) - (maxY - minY) * mmK) / 2
  const view = { x: mmX((0 - t.x) / t.k), y: mmY((0 - t.y) / t.k), w: (size.w / t.k) * mmK, h: (size.h / t.k) * mmK }
  const nodeW = (n: Placed) => (G.down ? G.nodeCross(n) : CARD_W), nodeH = (n: Placed) => (G.down ? CARD_H : G.nodeCross(n))

  return (
    <div className="relative h-full w-full">
      <style>{`@keyframes sft-pop { from { transform: scale(.3); opacity: 0 } 65% { transform: scale(1.12); opacity: 1 } to { transform: scale(1); opacity: 1 } }`}</style>
      <svg ref={svgRef} className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing" style={{ background: '#FAF8F3' }} onClick={() => onSelect(null)}>
        <defs><clipPath id="disc"><circle cx={0} cy={0} r={17} /></clipPath><clipPath id="disc-sm"><circle cx={0} cy={0} r={12} /></clipPath></defs>
        <g transform={t.toString()}>
          {edgesShown.map((e) => (
            <path key={e.id} data-edge={e.id} pathLength={1} d={e.d} fill="none" stroke={e.id === selectedEdge ? '#A8843A' : '#B9C7B9'} strokeWidth={dots ? 4 : e.id === selectedEdge ? 1.5 : 1}
              style={{ opacity: e.leaving || edgesHidden ? 0 : 1, transition: 'opacity 280ms ease' }} />
          ))}
          {shown.map((n) => {
            const ghostly = n.entering || n.leaving
            const delay = n.leaving ? 0 : Math.max(0, n.rel - 1) * STAGGER_MS
            const a = n.b ? G.partner({ x: 0, y: 0 }, 'a') : { x: 0, y: 0 }, b = n.b ? G.partner({ x: 0, y: 0 }, 'b') : null
            const minis = n.others.map((q, i) => ({ q, ...(G.down ? { dx: a.x, dy: CARD_H / 2 + MINI_GAP + MINI_H / 2 + i * (MINI_H + 4) } : { dx: 0, dy: G.nodeCross(n) / 2 + MINI_GAP + MINI_H / 2 + i * (MINI_H + 4) }) }))
            return (
              <g key={n.id} style={{
                transform: `translate(${n.x}px, ${n.y}px) scale(${ghostly ? 0.4 : 1})`,
                opacity: ghostly ? 0 : 1,
                transition: `transform ${MOVE_MS}ms ${EASE_CSS} ${delay}ms, opacity ${n.leaving ? 380 : 320}ms ease ${delay}ms`,
                pointerEvents: n.leaving ? 'none' : undefined,
              }}>
                {b && (G.down
                  ? <line x1={-G.coupleGap / 2 - 2} y1={0} x2={G.coupleGap / 2 + 2} y2={0} stroke="#B9C7B9" strokeWidth={dots ? 4 : 1} />
                  : <line x1={0} y1={-G.coupleGap / 2 - 2} x2={0} y2={G.coupleGap / 2 + 2} stroke="#B9C7B9" strokeWidth={dots ? 4 : 1} />)}
                <PersonCard person={n.a!} dx={a.x} dy={a.y} depth={n.depth} dots={dots} selected={selectedId === n.a!.id} onSelect={onSelect} />
                {n.b && b && <PersonCard person={n.b} dx={b.x} dy={b.y} depth={n.depth} dots={dots} selected={selectedId === n.b.id} onSelect={onSelect} />}
                {!dots && minis.map(({ q, dx, dy }) => <MiniCard key={q.id} person={q} dx={dx} dy={dy} selected={selectedId === q.id} onSelect={onSelect} />)}
                {n.kids > 0 && !n.leaving && <FoldToggle orient={layout.orient} kids={n.kids} hidden={n.hidden} dots={dots} onToggle={() => toggle(n)} />}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Minimap (bottom-right, below the zoom controls the page renders) */}
      <svg width={MM_W} height={MM_H} className="absolute right-8 bottom-7 hidden rounded border border-line bg-white sm:block" style={{ pointerEvents: 'none' }}>
        {mmOk && layout.placed.map((n) => (
          <rect key={n.id} x={mmX(n.x - nodeW(n) / 2)} y={mmY(n.y - nodeH(n) / 2)} width={Math.max(2, nodeW(n) * mmK)} height={Math.max(2, nodeH(n) * mmK)} rx={1} fill={n.a!.id === selectedId || n.b?.id === selectedId ? '#2E4A38' : '#D6D0C2'} />
        ))}
        {mmOk && <rect x={view.x} y={view.y} width={view.w} height={view.h} fill="none" stroke="#2E4A38" strokeWidth={1} rx={2} />}
      </svg>
    </div>
  )
}

/** Fold control on the generation side of a couple with children: a "−" on the stem while open, a "+N" pill (N hidden relatives) while folded. Drawn relative to the couple's centre. */
function FoldToggle({ orient, kids, hidden, dots, onToggle }: { orient: Orient; kids: number; hidden: number; dots: boolean; onToggle: () => void }) {
  const stop = (e: React.MouseEvent) => { e.stopPropagation(); onToggle() }
  const down = orient === 'down'
  const edge = down ? CARD_H / 2 : CARD_W / 2 // where the card ends along the generation axis
  if (hidden) {
    const label = `+${hidden}`
    const w = 18 + label.length * 8
    const s = dots ? 2.4 : 1 // stay legible when the map is zoomed out to dots
    const c = edge + (dots ? 34 : 18) + (down ? 0 : (w / 2) * s - 10 * s) // pill centre along the generation axis
    const pill = down ? { x: 0, y: c } : { x: c, y: 0 }
    const stubEnd = down ? { x: 0, y: c - 10 * s } : { x: c - (w / 2) * s, y: 0 }
    return (
      <g className="cursor-pointer" onClick={stop}>
        <title>{`Show ${hidden} hidden relative${hidden === 1 ? '' : 's'}`}</title>
        <line x1={down ? 0 : edge} y1={down ? edge : 0} x2={stubEnd.x} y2={stubEnd.y} stroke="#B9C7B9" strokeWidth={dots ? 4 : 1} />
        <g style={{ transform: `translate(${pill.x}px, ${pill.y}px) scale(${s})` }}>
          <g style={{ animation: `sft-pop 460ms cubic-bezier(.2,.9,.3,1.25) ${MOVE_MS - 260}ms both` }}>
            <rect x={-w / 2} y={-10} width={w} height={20} rx={10} fill="#DCE8DD" stroke="#2E4A38" strokeWidth={1} />
            <text textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={500} fill="#2E4A38">{label}</text>
          </g>
        </g>
      </g>
    )
  }
  if (dots) return null
  return (
    <g transform={down ? `translate(0,${edge + 16})` : `translate(${edge + 16},0)`} className="cursor-pointer" onClick={stop}>
      <title>{`Hide ${kids === 1 ? 'this child' : `these ${kids} children`} and their families`}</title>
      <circle r={13} fill="transparent" />
      <circle r={8} fill="#fff" stroke="#B9C7B9" strokeWidth={1} />
      <line x1={-4} y1={0} x2={4} y2={0} stroke="#2E4A38" strokeWidth={1.5} />
    </g>
  )
}

/** One person's card, drawn relative to the couple's centre (dx/dy = offset of the card's centre). */
function PersonCard({ person: p, dx, dy, depth, dots, selected, onSelect }: { person: Person; dx: number; dy: number; depth: number; dots: boolean; selected: boolean; onSelect: (id: string) => void }) {
  const { data: photo } = useSignedUrl(p.photo_path)
  const tint = TINTS[((depth % TINTS.length) + TINTS.length) % TINTS.length] // ancestors above the founders have negative depths
  const initials = `${p.given_names[0] ?? ''}${p.surname[0] ?? ''}`.toUpperCase() || '?'
  const stop = (e: React.MouseEvent) => { e.stopPropagation(); onSelect(p.id) }
  const left = dx - CARD_W / 2, top = dy - CARD_H / 2

  if (dots)
    return <circle cx={dx} cy={dy} r={selected ? 34 : 26} fill={selected ? '#2E4A38' : tint.bg} stroke={selected ? '#2E4A38' : tint.ink} strokeWidth={3} className="cursor-pointer" onClick={stop} />

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

/** A further spouse (e.g. an earlier marriage), stacked beneath the person's own card. Drawn relative to the couple's centre. */
function MiniCard({ person: p, dx, dy, selected, onSelect }: { person: Person; dx: number; dy: number; selected: boolean; onSelect: (id: string) => void }) {
  const { data: photo } = useSignedUrl(p.photo_path)
  const initials = `${p.given_names[0] ?? ''}${p.surname[0] ?? ''}`.toUpperCase() || '?'
  const first = p.nickname ? p.nickname : p.given_names.split(' ')[0] || p.surname || '?'
  const left = dx - MINI_W / 2, top = dy - MINI_H / 2
  return (
    <g className="cursor-pointer" onClick={(e) => { e.stopPropagation(); onSelect(p.id) }}>
      <line x1={dx} y1={top - MINI_GAP} x2={dx} y2={top} stroke="#C4B8A6" strokeWidth={1} />
      <rect x={left} y={top} width={MINI_W} height={MINI_H} rx={6} fill={selected ? '#2E4A38' : '#fff'} stroke={selected ? '#2E4A38' : '#C4B8A6'} strokeWidth={1} strokeDasharray={selected ? undefined : '3 2'} />
      <g transform={`translate(${left + 8 + 12},${dy})`}>
        <circle r={12} fill={selected ? '#FAF8F3' : '#F6F3EE'} />
        {photo ? <image href={photo} x={-12} y={-12} width={24} height={24} preserveAspectRatio="xMidYMid slice" clipPath="url(#disc-sm)" />
          : <text textAnchor="middle" dominantBaseline="central" fontSize={10} fill="#6B5D4D">{initials}</text>}
      </g>
      <text x={left + 36} y={dy - 2} fontSize={12} fill={selected ? '#FAF8F3' : '#2A2A26'}>{trunc(first, 14)}</text>
      <text x={left + 36} y={dy + 11} fontSize={9.5} letterSpacing=".04em" fill={selected ? '#D6CFBF' : '#8A8578'}>{lifespan(p) || 'm.'}</text>
    </g>
  )
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
