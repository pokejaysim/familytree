import type { TreeData } from './queries'
import type { Family, Person } from './types'

/** Index a TreeData snapshot for fast relationship lookups. */
export function buildGraph(data: TreeData) {
  const people = new Map(data.people.map((p) => [p.id, p]))
  const families = new Map(data.families.map((f) => [f.id, f]))
  const familiesOfParent = new Map<string, Family[]>()
  const familiesOfChild = new Map<string, Family[]>()
  const childrenOfFamily = new Map<string, Person[]>()

  for (const f of data.families) {
    for (const pid of [f.partner1_id, f.partner2_id]) {
      if (!pid) continue
      familiesOfParent.set(pid, [...(familiesOfParent.get(pid) ?? []), f])
    }
  }
  for (const fc of data.children) {
    const f = families.get(fc.family_id)
    const p = people.get(fc.person_id)
    if (!f || !p) continue
    familiesOfChild.set(p.id, [...(familiesOfChild.get(p.id) ?? []), f])
    childrenOfFamily.set(f.id, [...(childrenOfFamily.get(f.id) ?? []), p])
  }

  const partnerOf = (f: Family, pid: string) => people.get(f.partner1_id === pid ? f.partner2_id ?? '' : f.partner1_id ?? '') ?? null
  const parentsOf = (pid: string): Person[] =>
    (familiesOfChild.get(pid) ?? []).flatMap((f) => [f.partner1_id, f.partner2_id]).map((id) => (id ? people.get(id) : null)).filter((p): p is Person => !!p)
  const childrenOf = (pid: string): Person[] => (familiesOfParent.get(pid) ?? []).flatMap((f) => childrenOfFamily.get(f.id) ?? [])
  const siblingsOf = (pid: string): Person[] => {
    const out = new Map<string, Person>()
    for (const f of familiesOfChild.get(pid) ?? []) for (const c of childrenOfFamily.get(f.id) ?? []) if (c.id !== pid) out.set(c.id, c)
    return [...out.values()]
  }

  return { people, families, familiesOfParent, familiesOfChild, childrenOfFamily, partnerOf, parentsOf, childrenOf, siblingsOf }
}
export type Graph = ReturnType<typeof buildGraph>
