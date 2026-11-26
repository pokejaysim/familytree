import type { Graph } from './graph'
import type { Person } from './types'
import { fullName } from './dates'

/** Generations up from `id` to each ancestor (the person themself at 0). */
function upward(graph: Graph, id: string): Map<string, number> {
  const out = new Map<string, number>([[id, 0]])
  let frontier = [id]
  for (let d = 1; frontier.length; d++) {
    const next: string[] = []
    for (const pid of frontier) for (const p of graph.parentsOf(pid)) if (!out.has(p.id)) { out.set(p.id, d); next.push(p.id) }
    frontier = next
  }
  return out
}

const gendered = (p: Person, m: string, f: string, n: string) => (p.sex === 'M' ? m : p.sex === 'F' ? f : n)
const NTH = ['', '', '', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th']
/** 0 → "", 1 → "great-", 2 → "great-great-", 3+ → "3rd great-" (how genealogists say it once the greats pile up). */
const greats = (n: number) => (n <= 0 ? '' : n <= 2 ? 'great-'.repeat(n) : `${NTH[n] ?? `${n}th`} great-`)
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth']
const TIMES = ['', 'once', 'twice', 'three times', 'four times', 'five times']

/** Blood relationship of `them` to `me` ("cousin", "great-aunt"), or null when they share no recorded ancestor. */
function blood(graph: Graph, meId: string, them: Person): string | null {
  const mine = upward(graph, meId)
  const theirs = upward(graph, them.id)
  let best: [number, number] | null = null
  for (const [id, b] of theirs) {
    const a = mine.get(id)
    if (a !== undefined && (!best || a + b < best[0] + best[1])) best = [a, b]
  }
  if (!best) return null
  const [a, b] = best // a: my steps up to the shared ancestor; b: theirs
  if (a === 0 && b === 0) return 'you'
  if (b === 0) return a === 1 ? gendered(them, 'father', 'mother', 'parent') : greats(a - 2) + gendered(them, 'grandfather', 'grandmother', 'grandparent')
  if (a === 0) return b === 1 ? gendered(them, 'son', 'daughter', 'child') : greats(b - 2) + gendered(them, 'grandson', 'granddaughter', 'grandchild')
  if (a === 1 && b === 1) return gendered(them, 'brother', 'sister', 'sibling')
  if (a === 1) return greats(b - 2) + gendered(them, 'nephew', 'niece', 'niece or nephew')
  if (b === 1) return greats(a - 2) + gendered(them, 'uncle', 'aunt', 'aunt or uncle')
  const degree = Math.min(a, b) - 1, removed = Math.abs(a - b)
  const base = degree === 1 ? 'cousin' : `${ORD[degree] ?? `${degree}th`} cousin`
  return removed ? `${base} ${TIMES[removed] ?? `${removed} times`} removed` : base
}

const partnersOf = (graph: Graph, id: string) =>
  (graph.familiesOfParent.get(id) ?? []).map((f) => graph.partnerOf(f, id)).filter((q): q is Person => !!q)

/**
 * How `them` is related to the visitor, in words: "your cousin", "your uncle’s wife", "your wife’s sister".
 * Null when the tree records no link (or when it's the visitor themself).
 */
export function relationTo(graph: Graph, meId: string | null | undefined, them: Person): string | null {
  if (!meId || meId === them.id || !graph.people.has(meId)) return null
  const direct = blood(graph, meId, them)
  if (direct) return `your ${direct}`
  if (partnersOf(graph, meId).some((q) => q.id === them.id)) return `your ${gendered(them, 'husband', 'wife', 'partner')}`
  // Married into the family: the partner of one of your relatives.
  for (const q of partnersOf(graph, them.id)) {
    const r = blood(graph, meId, q)
    if (r && r !== 'you') return `your ${r}’s ${gendered(them, 'husband', 'wife', 'partner')}`
  }
  // Your partner's family.
  for (const s of partnersOf(graph, meId)) {
    const r = blood(graph, s.id, them)
    if (r && r !== 'you') return `your ${gendered(s, 'husband', 'wife', 'partner')}’s ${r}`
  }
  return null
}

export interface Branch { key: string; title: string; note?: string; people: Person[] }

const sortKey = (p: Person) => p.birth_date_sort ?? '9999'

/**
 * The tree split the way the book is: the founding couple (and anyone recorded above them) first,
 * then one group per child of the founders, in birth order, holding their descendants and the people
 * who married in. Each group lists generation by generation, oldest first.
 */
export function branchesOf(graph: Graph): Branch[] {
  const all = [...graph.people.values()]
  if (all.length === 0) return []
  // Founders: the parentless person with the most children, plus their partners.
  const childCount = (p: Person) => graph.childrenOf(p.id).length
  const roots = all.filter((p) => graph.parentsOf(p.id).length === 0)
  const founder = roots.sort((a, b) => childCount(b) - childCount(a))[0]
  if (!founder || childCount(founder) === 0) return [{ key: 'all', title: 'Everyone', people: all.sort((a, b) => sortKey(a).localeCompare(sortKey(b))) }]
  const founders = [founder, ...partnersOf(graph, founder.id)]
  const heads = [...new Map(graph.childrenOf(founder.id).map((c) => [c.id, c])).values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const headIds = new Set(heads.map((h) => h.id))

  // Generation depth below a branch head for everyone descended from one.
  const home = new Map<string, { head: string; depth: number }>()
  for (const h of heads) {
    const walk = (p: Person, depth: number) => {
      if (home.has(p.id)) return
      home.set(p.id, { head: h.id, depth })
      for (const c of graph.childrenOf(p.id)) walk(c, depth + 1)
    }
    walk(h, 0)
  }
  // People who married in sit with their partner, one step after them; their parents sit with their child.
  for (const p of all) {
    if (home.has(p.id) || headIds.has(p.id)) continue
    const q = partnersOf(graph, p.id).find((x) => home.has(x.id))
    if (q) { const h = home.get(q.id)!; home.set(p.id, { head: h.head, depth: h.depth + 0.5 }) }
  }
  for (const p of all) {
    if (home.has(p.id)) continue
    const c = graph.childrenOf(p.id).find((x) => home.has(x.id))
    if (c) { const h = home.get(c.id)!; home.set(p.id, { head: h.head, depth: h.depth - 1 }) }
  }

  // The first generation: the founders and everyone recorded above them.
  const firstIds = new Set<string>()
  for (const f of founders) for (const id of upward(graph, f.id).keys()) firstIds.add(id)
  const order = (list: Person[], depth: (p: Person) => number) =>
    list.sort((a, b) => depth(a) - depth(b) || sortKey(a).localeCompare(sortKey(b)) || fullName(a).localeCompare(fullName(b)))

  const first = all.filter((p) => firstIds.has(p.id))
  const above = founders.map((f) => upward(graph, f.id))
  const firstDepth = (p: Person) => -Math.max(...above.map((m) => m.get(p.id) ?? -1))
  const out: Branch[] = [{ key: 'first', title: `${founders.map((f) => f.nickname || f.given_names.split(' ')[0]).join(' and ')}`, note: 'The first generation, and the family recorded before them', people: order(first, firstDepth) }]
  for (const h of heads) {
    const people = all.filter((p) => home.get(p.id)?.head === h.id && !firstIds.has(p.id))
    out.push({ key: h.id, title: `${fullName(h)}’s family`, people: order(people, (p) => home.get(p.id)!.depth) })
  }
  const rest = all.filter((p) => !home.has(p.id) && !firstIds.has(p.id))
  if (rest.length) out.push({ key: 'rest', title: 'Not yet connected', note: 'People the tree doesn’t link to the family yet', people: order(rest, () => 0) })
  return out.filter((b) => b.people.length)
}

export const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** The founding couple: the parentless person with the most children, and their partner(s). */
export function foundersOf(graph: Graph): Person[] {
  const roots = [...graph.people.values()].filter((p) => graph.parentsOf(p.id).length === 0)
  const f = roots.sort((a, b) => graph.childrenOf(b.id).length - graph.childrenOf(a.id).length)[0]
  if (!f || graph.childrenOf(f.id).length === 0) return []
  const partners = (graph.familiesOfParent.get(f.id) ?? []).map((fam) => graph.partnerOf(fam, f.id)).filter((q): q is Person => !!q)
  return [f, ...partners.slice(0, 1)]
}

/** Generations from the founders down, counting them as the first. */
export function generationsBelow(graph: Graph, founder: Person): number {
  let depth = 0
  const walk = (p: Person, d: number, seen: Set<string>) => {
    if (seen.has(p.id)) return
    seen.add(p.id); depth = Math.max(depth, d)
    graph.childrenOf(p.id).forEach((c) => walk(c, d + 1, seen))
  }
  walk(founder, 1, new Set())
  return depth
}
