import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hierarchy, tree as d3tree } from 'd3-hierarchy'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import 'd3-transition'
import { easeCubicInOut } from 'd3-ease'
import type { Graph } from '../lib/graph'
import type { Person } from '../lib/types'
import { fullName, lifespan } from '../lib/dates'
import { useSignedUrl } from '../lib/queries'

/**
 * Infinite-canvas family tree. The whole tree is laid out once; couples share a node.
 * Pan/zoom freely; cards reveal more detail as you zoom in (semantic zoom).
 */

interface CoupleNode { id: string; a: Person; b: Person | null; children?: CoupleNode[] }
interface Placed { id: string; a: Person; b: Person | null; x: number; y: number; depth: number }
interface Edge { x1: number; y1: number; x2: number; y2: number }

const CARD_W = 150, CARD_H = 170, COUPLE_GAP = 14, NODE_GAP_X = 60, NODE_GAP_Y = 150
const nodeWidth = (n: { b: Person | null }) => (n.b ? CARD_W * 2 + COUPLE_GAP : CARD_W)

export interface TreeCanvasHandle { zoomTo: (personId: string) => void; fit: () => void; zoomBy: (k: number) => void }

export default function TreeCanvas({
  graph, selectedId, onSelect, handleRef,
}: { graph: Graph; selectedId: string | null; onSelect: (id: string | null) => void; handleRef: React.MutableRefObject<TreeCanvasHandle | null> }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [t, setT] = useState<ZoomTransform>(zoomIdentity)

  // ---- Layout: forest of couple-nodes, roots = people with no recorded parents ----
  const layout = useMemo(() => {
    const seen = new Set<string>()
    const build = (p: Person): CoupleNode => {
      seen.add(p.id)
      const fams = graph.familiesOfParent.get(p.id) ?? []
      const partner = fams.map((f) => graph.partnerOf(f, p.id)).find((q) => q && !seen.has(q.id)) ?? null
      if (partner) seen.add(partner.id)
      const kids = fams.flatMap((f) => graph.childrenOfFamily.get(f.id) ?? []).filter((k) => !seen.has(k.id))
      return { id: p.id, a: p, b: partner, children: kids.map(build) }
    }
    const people = [...graph.people.values()].sort((a, b) => (a.birth_date_sort ?? '9999').localeCompare(b.birth_date_sort ?? '9999'))
    const roots: CoupleNode[] = []
    for (const p of people) if (!seen.has(p.id) && graph.parentsOf(p.id).length === 0) roots.push(build(p))
    for (const p of people) if (!seen.has(p.id)) roots.push(build(p)) // cycles / orphans

    const placed: Placed[] = []
    const edges: Edge[] = []
    let offsetX = 0
    for (const root of roots) {
      const h = d3tree<CoupleNode>().nodeSize([1, CARD_H + NODE_GAP_Y]).separation((a, b) => (nodeWidth(a.data) + nodeWidth(b.data)) / 2 + NODE_GAP_X)(hierarchy(root))
      const nodes = h.descendants()
      const minX = Math.min(...nodes.map((n) => n.x - nodeWidth(n.data) / 2))
      for (const n of nodes) {
        const x = n.x - minX + offsetX
        placed.push({ id: n.data.id, a: n.data.a, b: n.data.b, x, y: n.y, depth: n.depth })
        if (n.parent) edges.push({ x1: n.parent.x - minX + offsetX, y1: n.parent.y + CARD_H / 2, x2: x, y2: n.y - CARD_H / 2 })
      }
      offsetX += Math.max(...nodes.map((n) => n.x - minX + nodeWidth(n.data) / 2)) + NODE_GAP_X * 3
    }
    const xs = placed.flatMap((p) => [p.x - nodeWidth(p) / 2, p.x + nodeWidth(p) / 2])
    const ys = placed.flatMap((p) => [p.y - CARD_H / 2, p.y + CARD_H / 2])
    const bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
    // person id -> world position of their individual card
    const cardPos = new Map<string, { x: number; y: number }>()
    for (const p of placed) {
      if (p.b) {
        cardPos.set(p.a.id, { x: p.x - (CARD_W + COUPLE_GAP) / 2, y: p.y })
        cardPos.set(p.b.id, { x: p.x + (CARD_W + COUPLE_GAP) / 2, y: p.y })
      } else cardPos.set(p.a.id, { x: p.x, y: p.y })
    }
    return { placed, edges, bounds, cardPos }
  }, [graph])

  // ---- Zoom behaviour ----
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const z = zoom<SVGSVGElement, unknown>().scaleExtent([0.05, 4]).on('zoom', (ev) => setT(ev.transform))
    zoomRef.current = z
    select(svg).call(z).on('dblclick.zoom', null)
    return () => { select(svg).on('.zoom', null) }
  }, [])

  const animateTo = useCallback((tr: ZoomTransform, ms = 750) => {
    const svg = svgRef.current, z = zoomRef.current
    if (!svg || !z) return
    select(svg).transition().duration(ms).ease(easeCubicInOut).call(z.transform, tr)
  }, [])

  const fit = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
    const { width, height } = svg.getBoundingClientRect()
    const { minX, maxX, minY, maxY } = layout.bounds
    const k = Math.min(2, 0.85 * Math.min(width / (maxX - minX), height / (maxY - minY)))
    animateTo(zoomIdentity.translate(width / 2 - ((minX + maxX) / 2) * k, height / 2 - ((minY + maxY) / 2) * k).scale(k))
  }, [layout, animateTo])

  const zoomTo = useCallback((personId: string) => {
    const svg = svgRef.current
    const pos = layout.cardPos.get(personId)
    if (!svg || !pos) return
    const { width, height } = svg.getBoundingClientRect()
    const k = 1.6
    // leave room on the right for the detail panel
    animateTo(zoomIdentity.translate(width * 0.38 - pos.x * k, height / 2 - pos.y * k).scale(k))
  }, [layout, animateTo])

  const zoomBy = useCallback((f: number) => {
    const svg = svgRef.current, z = zoomRef.current
    if (!svg || !z) return
    select(svg).transition().duration(250).call(z.scaleBy, f)
  }, [])

  useEffect(() => { handleRef.current = { zoomTo, fit, zoomBy } }, [handleRef, zoomTo, fit, zoomBy])
  useEffect(() => { fit() }, [fit])

  const k = t.k
  const detail: 'dot' | 'name' | 'card' = k < 0.28 ? 'dot' : k < 0.7 ? 'name' : 'card'

  return (
    <svg ref={svgRef} className="h-full w-full touch-none select-none" style={{ background: 'var(--color-paper)' }} onClick={() => onSelect(null)}>
      <defs>
        <pattern id="dots" width={28} height={28} patternUnits="userSpaceOnUse" patternTransform={`translate(${t.x} ${t.y}) scale(${k})`}>
          <circle cx={1.5} cy={1.5} r={1.2} fill="#d9d0c3" />
        </pattern>
        <clipPath id="avatar"><circle cx={CARD_W / 2} cy={54} r={40} /></clipPath>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx={0} dy={2} stdDeviation={3} floodColor="#2b2620" floodOpacity={0.12} /></filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" />
      <g transform={t.toString()}>
        {layout.edges.map((e, i) => (
          <path key={i} d={`M${e.x1},${e.y1} C${e.x1},${(e.y1 + e.y2) / 2} ${e.x2},${(e.y1 + e.y2) / 2} ${e.x2},${e.y2}`} fill="none" stroke="#c4b8a6" strokeWidth={detail === 'dot' ? 6 : 2} />
        ))}
        {layout.placed.map((n) => (
          <g key={n.id}>
            {n.b && <line x1={n.x - COUPLE_GAP} y1={n.y} x2={n.x + COUPLE_GAP} y2={n.y} stroke="#c4b8a6" strokeWidth={detail === 'dot' ? 6 : 3} />}
            <PersonCard person={n.a} x={layout.cardPos.get(n.a.id)!.x} y={n.y} detail={detail} selected={selectedId === n.a.id} onSelect={onSelect} />
            {n.b && <PersonCard person={n.b} x={layout.cardPos.get(n.b.id)!.x} y={n.y} detail={detail} selected={selectedId === n.b.id} onSelect={onSelect} />}
          </g>
        ))}
      </g>
    </svg>
  )
}

function PersonCard({ person: p, x, y, detail, selected, onSelect }: { person: Person; x: number; y: number; detail: 'dot' | 'name' | 'card'; selected: boolean; onSelect: (id: string) => void }) {
  const { data: photo } = useSignedUrl(p.photo_path)
  const tone = p.sex === 'F' ? { bg: '#fdf1f3', ring: '#e6a9b4', ink: '#8a3b4c' } : p.sex === 'M' ? { bg: '#eef5fb', ring: '#9dbfdc', ink: '#2f5b80' } : { bg: '#f6f3ee', ring: '#cdbfae', ink: '#6b5d4d' }
  const initials = `${p.given_names[0] ?? ''}${p.surname[0] ?? ''}`.toUpperCase() || '?'
  const stop = (e: React.MouseEvent) => { e.stopPropagation(); onSelect(p.id) }

  if (detail === 'dot')
    return <circle cx={x} cy={y} r={selected ? 40 : 30} fill={tone.ring} stroke={selected ? '#4f6b4a' : '#fff'} strokeWidth={8} className="cursor-pointer" onClick={stop} />

  if (detail === 'name')
    return (
      <g transform={`translate(${x - CARD_W / 2},${y - 36})`} className="cursor-pointer" onClick={stop}>
        <rect width={CARD_W} height={72} rx={14} fill={tone.bg} stroke={selected ? '#4f6b4a' : tone.ring} strokeWidth={selected ? 5 : 2} />
        <text x={CARD_W / 2} y={32} textAnchor="middle" fontSize={20} fontWeight={600} fill="#2b2620" fontFamily="Fraunces, serif">{trunc(p.given_names || '?', 12)}</text>
        <text x={CARD_W / 2} y={56} textAnchor="middle" fontSize={17} fill="#6b6259">{trunc(p.surname, 13)}</text>
      </g>
    )

  return (
    <g transform={`translate(${x - CARD_W / 2},${y - CARD_H / 2})`} className="cursor-pointer" onClick={stop} filter="url(#shadow)">
      <rect width={CARD_W} height={CARD_H} rx={14} fill="#fff" stroke={selected ? '#4f6b4a' : '#e2dbd0'} strokeWidth={selected ? 3 : 1} />
      <circle cx={CARD_W / 2} cy={54} r={42} fill={tone.ring} />
      {photo ? (
        <image href={photo} x={CARD_W / 2 - 40} y={14} width={80} height={80} preserveAspectRatio="xMidYMid slice" clipPath="url(#avatar)" />
      ) : (
        <>
          <circle cx={CARD_W / 2} cy={54} r={40} fill={tone.bg} />
          <text x={CARD_W / 2} y={64} textAnchor="middle" fontSize={28} fontWeight={600} fill={tone.ink}>{initials}</text>
        </>
      )}
      <text x={CARD_W / 2} y={120} textAnchor="middle" fontSize={14} fontWeight={600} fill="#2b2620" fontFamily="Fraunces, serif">{trunc(fullName(p), 18)}</text>
      <text x={CARD_W / 2} y={140} textAnchor="middle" fontSize={11} fill="#6b6259">{lifespan(p)}</text>
      {p.birth_place && <text x={CARD_W / 2} y={156} textAnchor="middle" fontSize={10} fill="#8a8178">{trunc(p.birth_place, 22)}</text>}
    </g>
  )
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
