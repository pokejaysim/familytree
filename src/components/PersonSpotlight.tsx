import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import type { Graph } from '../lib/graph'
import type { Person } from '../lib/types'
import { fullName } from '../lib/dates'
import { useSignedUrl } from '../lib/queries'

/** Bottom-left spotlight card from the Kinfolk design: disc, name, born line, one-paragraph summary, brass/moss actions. */
export default function PersonSpotlight({ person: p, graph, treeId, onClose, onJump, onAddRelative }: {
  person: Person; graph: Graph; treeId: string; onClose: () => void; onJump: (id: string) => void; onAddRelative?: () => void
}) {
  const { data: photo } = useSignedUrl(p.photo_path)
  const parents = graph.parentsOf(p.id)
  const partners = (graph.familiesOfParent.get(p.id) ?? []).map((f) => graph.partnerOf(f, p.id)).filter((q): q is Person => !!q)
  const children = graph.childrenOf(p.id)
  const siblings = graph.siblingsOf(p.id)
  const initials = `${p.given_names[0] ?? ''}${p.surname[0] ?? ''}`.toUpperCase() || '?'

  const born = [p.birth_date ? `Born ${p.birth_date}` : null, p.birth_place].filter(Boolean).join(', ')
  const died = !p.is_living && (p.death_date || p.death_place) ? ['Died', p.death_date, p.death_place].filter(Boolean).join(' ').replace('Died ', 'Died ') : null

  // Relationship summary sentence, like "Married to Daniel Reyes, 2017. Two children. One brother."
  const bits: string[] = []
  const fams = graph.familiesOfParent.get(p.id) ?? []
  partners.forEach((q) => { const f = fams.find((f) => f.partner1_id === q.id || f.partner2_id === q.id); bits.push(`${f?.union_type === 'partnership' ? 'Partner of' : 'Married to'} ${fullName(q)}${f?.start_date ? `, ${f.start_date}` : ''}.`) })
  if (children.length) bits.push(`${count(children.length)} ${children.length === 1 ? 'child' : 'children'}.`)
  if (siblings.length) bits.push(`${count(siblings.length)} ${siblings.length === 1 ? 'sibling' : 'siblings'}.`)
  if (parents.length) bits.push(`${parents.length === 1 ? 'Child' : 'Child'} of ${parents.map(fullName).join(' and ')}.`)
  const summary = p.bio ? p.bio : bits.join(' ')

  const chip = (q: Person) => (
    <button key={q.id} className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-[13px] hover:border-moss hover:bg-moss-light" onClick={() => onJump(q.id)}>{fullName(q)}</button>
  )

  return (
    <aside className="absolute inset-x-0 bottom-0 z-20 max-h-[62%] overflow-y-auto rounded-t-xl border border-line bg-white p-5 shadow-[0_-8px_24px_rgba(42,42,38,.10)] sm:inset-x-auto sm:bottom-7 sm:left-8 sm:max-h-none sm:w-[300px] sm:rounded-md sm:shadow-[0_8px_24px_rgba(42,42,38,.08)]" style={{ animation: 'riseIn .3s cubic-bezier(.2,.8,.2,1)', paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
      <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />
      <button onClick={onClose} className="absolute top-3 right-3 rounded-full p-1 text-ink-mute hover:bg-paper" aria-label="Close"><X size={14} /></button>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-moss text-[15px] text-cream">
          {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : initials}
        </span>
        <span className="grid gap-px">
          <span className="text-[18px] leading-tight text-ink">{fullName(p)}</span>
          <span className="text-[13px] italic text-ink-mute">{born || died || (p.is_living ? 'Living' : 'Dates unknown')}</span>
        </span>
      </div>
      {died && born && <p className="mt-1 text-[13px] italic text-ink-mute">{died}</p>}
      {summary && <p className="mt-3 line-clamp-5 text-[14px] leading-relaxed text-ink-soft">{summary}</p>}
      {(parents.length + partners.length + children.length + siblings.length) > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">{[...parents, ...partners, ...siblings, ...children].map(chip)}</div>
      )}
      <div className="mt-3.5 flex justify-between border-t border-line pt-3 text-[12px] uppercase tracking-[.12em]">
        <Link to={`/trees/${treeId}/people/${p.id}`} className="text-brass hover:underline">Open profile</Link>
        {onAddRelative && <button className="text-moss hover:underline" onClick={onAddRelative}>Add a relative</button>}
      </div>
    </aside>
  )
}

const count = (n: number) => ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][n] ?? String(n)
