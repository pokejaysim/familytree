import { useEffect, useMemo, useRef } from 'react'
import { hierarchy, tree as d3tree, type HierarchyPointNode } from 'd3-hierarchy'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom'
import type { Graph } from '../lib/graph'
import type { Person } from '../lib/types'
import { fullName, lifespan } from '../lib/dates'

interface Node { person: Person; partner?: Person | null; children?: Node[] }

const W = 190, H = 58, GAP_X = 24, GAP_Y = 70

/** Focus person in the middle; ancestors fan upward, descendants fan downward. Pan/zoom with mouse or touch. */
export default function TreeChart({ graph, focusId, onSelect, generations = 4 }: { graph: Graph; focusId: string; onSelect: (id: string) => void; generations?: number }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  const layout = useMemo(() => {
    const focus = graph.people.get(focusId)
    if (!focus) return null

    const descend = (p: Person, depth: number, seen: Set<string>): Node => {
      if (seen.has(p.id)) return { person: p }
      seen.add(p.id)
      const fams = graph.familiesOfParent.get(p.id) ?? []
      const partner = fams.length === 1 ? graph.partnerOf(fams[0], p.id) : null
      const kids = depth >= generations ? [] : fams.flatMap((f) => graph.childrenOfFamily.get(f.id) ?? [])
      return { person: p, partner, children: kids.map((k) => descend(k, depth + 1, seen)) }
    }
    const ascend = (p: Person, depth: number, seen: Set<string>): Node => {
      if (seen.has(p.id)) return { person: p }
      seen.add(p.id)
      const parents = depth >= generations ? [] : graph.parentsOf(p.id)
      return { person: p, children: parents.map((q) => ascend(q, depth + 1, seen)) }
    }

    const down = d3tree<Node>().nodeSize([W + GAP_X, H + GAP_Y])(hierarchy(descend(focus, 0, new Set())))
    const up = d3tree<Node>().nodeSize([W + GAP_X, H + GAP_Y])(hierarchy(ascend(focus, 0, new Set())))
    const downNodes = down.descendants()
    const upNodes = up.descendants().filter((n) => n.depth > 0)
    const upLinks = up.links()
    const downLinks = down.links()
    // Partner boxes widen the descendant cards; shift x for spacing
    const xs = [...downNodes, ...upNodes].map((n) => n.x)
    const ys = [...downNodes.map((n) => n.y), ...upNodes.map((n) => -n.y)]
    return {
      downNodes, upNodes, upLinks, downLinks,
      bounds: { minX: Math.min(...xs) - W, maxX: Math.max(...xs) + W, minY: Math.min(...ys) - H, maxY: Math.max(...ys) + H },
    }
  }, [graph, focusId, generations])

  useEffect(() => {
    const svg = svgRef.current, g = gRef.current
    if (!svg || !g || !layout) return
    const z = zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 3]).on('zoom', (ev) => g.setAttribute('transform', ev.transform.toString()))
    zoomRef.current = z
    const sel = select(svg).call(z)
    const { width, height } = svg.getBoundingClientRect()
    const bw = layout.bounds.maxX - layout.bounds.minX, bh = layout.bounds.maxY - layout.bounds.minY
    const k = Math.min(1, 0.9 * Math.min(width / bw, height / bh))
    const cx = (layout.bounds.minX + layout.bounds.maxX) / 2, cy = (layout.bounds.minY + layout.bounds.maxY) / 2
    sel.call(z.transform, zoomIdentity.translate(width / 2 - cx * k, height / 2 - cy * k).scale(k))
    return () => { sel.on('.zoom', null) }
  }, [layout])

  if (!layout) return <p className="p-6 text-ink/50">Pick a person to start the chart.</p>

  const path = (sx: number, sy: number, tx: number, ty: number) => `M${sx},${sy} C${sx},${(sy + ty) / 2} ${tx},${(sy + ty) / 2} ${tx},${ty}`

  return (
    <svg ref={svgRef} className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing">
      <g ref={gRef}>
        {layout.upLinks.map((l, i) => <path key={'u' + i} d={path(l.source.x, -l.source.y - H / 2, l.target.x, -l.target.y + H / 2)} fill="none" stroke="#c9bfb0" strokeWidth={1.5} />)}
        {layout.downLinks.map((l, i) => <path key={'d' + i} d={path(l.source.x, l.source.y + H / 2, l.target.x, l.target.y - H / 2)} fill="none" stroke="#c9bfb0" strokeWidth={1.5} />)}
        {layout.upNodes.map((n) => <Card key={n.data.person.id} node={n} y={-n.y} focus={false} onSelect={onSelect} />)}
        {layout.downNodes.map((n) => <Card key={n.data.person.id} node={n} y={n.y} focus={n.depth === 0} onSelect={onSelect} />)}
      </g>
    </svg>
  )
}

function Card({ node, y, focus, onSelect }: { node: HierarchyPointNode<Node>; y: number; focus: boolean; onSelect: (id: string) => void }) {
  const p = node.data.person
  const partner = node.data.partner
  const fill = p.sex === 'F' ? '#fdf2f4' : p.sex === 'M' ? '#eef6fb' : '#f6f4ef'
  const x = node.x - W / 2
  return (
    <g>
      <g transform={`translate(${x},${y - H / 2})`} className="cursor-pointer" onClick={() => onSelect(p.id)}>
        <rect width={W} height={H} rx={8} fill={fill} stroke={focus ? '#4f6b4a' : '#d8cfc2'} strokeWidth={focus ? 2.5 : 1.2} />
        <text x={12} y={24} fontSize={13} fontWeight={600} fill="#2b2620">{truncate(fullName(p), 24)}</text>
        <text x={12} y={43} fontSize={11} fill="#6b6259">{lifespan(p)}{p.birth_place ? ` · ${truncate(p.birth_place, 20)}` : ''}</text>
      </g>
      {partner && (
        <g transform={`translate(${x + W + 6},${y - H / 2 + 8})`} className="cursor-pointer" onClick={() => onSelect(partner.id)}>
          <rect width={W * 0.8} height={H - 16} rx={6} fill="#fff" stroke="#e2dbd0" strokeDasharray="3 2" />
          <text x={10} y={18} fontSize={11} fill="#6b6259">⚭ {truncate(fullName(partner), 20)}</text>
          <text x={10} y={33} fontSize={10} fill="#8a8178">{lifespan(partner)}</text>
        </g>
      )}
    </g>
  )
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
