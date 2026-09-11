import { useMemo, useState } from 'react'
import type { Person } from '../lib/types'
import { fullName, lifespan } from '../lib/dates'

/** Search-and-pick an existing person, or create a new one inline. */
export default function PersonPicker({
  people, exclude = [], onPick, onCreateNew, placeholder = 'Search people…',
}: { people: Person[]; exclude?: string[]; onPick: (p: Person) => void; onCreateNew?: () => void; placeholder?: string }) {
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const ex = new Set(exclude)
    const t = q.toLowerCase().trim()
    return people.filter((p) => !ex.has(p.id) && (!t || fullName(p).toLowerCase().includes(t))).slice(0, 12)
  }, [people, q, exclude])
  return (
    <div className="space-y-2">
      <input className="input" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-md border border-line">
        {results.map((p) => (
          <li key={p.id}>
            <button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-moss-light" onClick={() => onPick(p)}>
              <span>{fullName(p)}</span><span className="text-ink/50">{lifespan(p)}</span>
            </button>
          </li>
        ))}
        {results.length === 0 && <li className="px-3 py-2 text-sm text-ink/50">No matches</li>}
      </ul>
      {onCreateNew && <button type="button" className="btn-ghost w-full justify-center" onClick={onCreateNew}>+ Create new person</button>}
    </div>
  )
}
