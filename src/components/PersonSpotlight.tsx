import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import type { Graph } from '../lib/graph'
import type { Person } from '../lib/types'
import { displayName, fullName, lifespan } from '../lib/dates'
import { useSignedUrl } from '../lib/queries'

/** Slide-in panel shown when a person is selected on the canvas. */
export default function PersonSpotlight({ person: p, graph, treeId, onClose, onJump }: { person: Person; graph: Graph; treeId: string; onClose: () => void; onJump: (id: string) => void }) {
  const { data: photo } = useSignedUrl(p.photo_path)
  const parents = graph.parentsOf(p.id)
  const partners = (graph.familiesOfParent.get(p.id) ?? []).map((f) => graph.partnerOf(f, p.id)).filter((q): q is Person => !!q)
  const children = graph.childrenOf(p.id)
  const siblings = graph.siblingsOf(p.id)
  const Chip = ({ q }: { q: Person }) => (
    <button className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-sm hover:border-moss hover:bg-moss-light" onClick={() => onJump(q.id)}>{fullName(q)}</button>
  )
  const Row = ({ label, people }: { label: string; people: Person[] }) => people.length ? (
    <div><div className="label">{label}</div><div className="flex flex-wrap gap-1.5">{people.map((q) => <Chip key={q.id} q={q} />)}</div></div>
  ) : null

  return (
    <aside className="absolute inset-y-4 right-4 z-20 flex w-[380px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl" style={{ animation: 'slideIn .35s cubic-bezier(.2,.8,.2,1)' }}>
      <div className="relative h-56 bg-moss-light">
        {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : (
          <div className="flex h-full items-center justify-center font-serif text-7xl text-moss/40">{`${p.given_names[0] ?? ''}${p.surname[0] ?? ''}`.toUpperCase()}</div>
        )}
        <button onClick={onClose} className="absolute top-3 right-3 rounded-full bg-white/90 p-1.5 shadow hover:bg-white" aria-label="Close"><X size={16} /></button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        <div>
          <h2 className="font-serif text-2xl leading-tight">{displayName(p)}</h2>
          <p className="text-ink/60">{lifespan(p)}</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {(p.birth_date || p.birth_place) && <><dt className="text-ink/50">Born</dt><dd>{[p.birth_date, p.birth_place].filter(Boolean).join(', ')}</dd></>}
          {!p.is_living && (p.death_date || p.death_place) && <><dt className="text-ink/50">Died</dt><dd>{[p.death_date, p.death_place].filter(Boolean).join(', ')}</dd></>}
        </dl>
        {p.bio ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{p.bio}</p> : <p className="text-sm italic text-ink/40">No biography yet. Open the profile to write one.</p>}
        <div className="space-y-3 border-t border-line pt-3">
          <Row label="Parents" people={parents} />
          <Row label={partners.length > 1 ? 'Partners' : 'Partner'} people={partners} />
          <Row label="Siblings" people={siblings} />
          <Row label="Children" people={children} />
        </div>
      </div>
      <div className="border-t border-line p-3">
        <Link to={`/trees/${treeId}/people/${p.id}`} className="btn-primary w-full justify-center">Open full profile</Link>
      </div>
    </aside>
  )
}
