/**
 * Genealogy dates are often fuzzy ("abt 1921", "Mar 1950", "before 1900").
 * We keep the text as written and derive a best-guess ISO date for sorting.
 */
const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

export function toSortDate(text: string | null | undefined): string | null {
  if (!text) return null
  const t = text.trim().toLowerCase()
  if (!t) return null

  // ISO-ish yyyy-mm-dd or yyyy/mm/dd
  let m = t.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])

  // "12 mar 1921" / "12 march 1921"
  m = t.match(/(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})/)
  if (m && MONTHS[m[2].slice(0, 3)]) return iso(+m[3], MONTHS[m[2].slice(0, 3)], +m[1])

  // "mar 12, 1921" / "march 1921"
  m = t.match(/([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (m && MONTHS[m[1].slice(0, 3)]) return iso(+m[3], MONTHS[m[1].slice(0, 3)], +m[2])
  m = t.match(/([a-z]+)\.?\s+(\d{4})/)
  if (m && MONTHS[m[1].slice(0, 3)]) return iso(+m[2], MONTHS[m[1].slice(0, 3)], 1)

  // any 4-digit year (handles "abt 1921", "bef 1900", "1921?")
  m = t.match(/(\d{4})/)
  if (m) return iso(+m[1], 1, 1)
  return null
}

function iso(y: number, mo: number, d: number) {
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function yearOf(sort: string | null | undefined): string {
  return sort ? sort.slice(0, 4) : ''
}

export function lifespan(p: { birth_date_sort: string | null; death_date_sort: string | null; is_living: boolean }): string {
  const b = yearOf(p.birth_date_sort)
  const d = yearOf(p.death_date_sort)
  if (d) return `${b || '?'} – ${d}`   // death recorded
  if (b) return `b. ${b}`               // no death recorded: never assume one
  return p.is_living ? 'Living' : ''
}

export function fullName(p: { given_names: string; surname: string; maiden_name?: string | null; nickname?: string | null }) {
  const n = [p.given_names, p.surname].filter(Boolean).join(' ').trim()
  return n || 'Unknown'
}

export function displayName(p: { given_names: string; surname: string; maiden_name?: string | null; nickname?: string | null }) {
  let n = fullName(p)
  if (p.nickname) n = `${p.given_names} "${p.nickname}" ${p.surname}`.trim()
  if (p.maiden_name) n += ` (née ${p.maiden_name})`
  return n
}
