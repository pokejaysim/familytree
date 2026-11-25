import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useTreeData } from '../lib/queries'
import { newId, useSubmit } from '../lib/changes'
import { useCanEdit, useMeId, useSaveLabel } from '../lib/profile'
import { buildGraph } from '../lib/graph'
import { branchesOf, relationTo } from '../lib/kin'
import { fullName, lifespan } from '../lib/dates'
import type { Person } from '../lib/types'
import type { Graph } from '../lib/graph'
import Modal from '../components/Modal'
import PersonForm from '../components/PersonForm'
import Avatar from '../components/Avatar'
import EmptyState from '../components/EmptyState'
import SupportLine from '../components/SupportLine'

/** Everyone in the tree, grouped the way the book is: the founders, then each of their children's families, generation by generation. */
export default function PeoplePage() {
  const { treeId = '' } = useParams()
  const nav = useNavigate()
  const { data, isLoading } = useTreeData(treeId)
  const graph = useMemo(() => (data ? buildGraph(data) : null), [data])
  const create = useSubmit(treeId)
  const saveLabel = useSaveLabel()
  const canEdit = useCanEdit()
  const meId = useMeId()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)

  const branches = useMemo(() => (graph ? branchesOf(graph) : []), [graph])
  const matches = useMemo(() => {
    const t = q.toLowerCase().trim()
    if (!t || !data) return null
    return data.people
      .filter((p) => [fullName(p), p.maiden_name ?? '', p.nickname ?? ''].some((s) => s.toLowerCase().includes(t)))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)))
  }, [data, q])

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <label className="relative flex-1">
          <span className="sr-only">Search by name</span>
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-mute" />
          <input className="input pl-9" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {canEdit && <button className="btn-primary shrink-0" onClick={() => setAdding(true)}><Plus size={16} /> <span className="hidden sm:inline">Add person</span><span className="sm:hidden">Add</span></button>}
      </div>
      {isLoading && <p className="text-ink-mute">Loading…</p>}
      {data && data.people.length === 0 && <EmptyState art="first-branch" title="Begin with one connection." text={canEdit ? 'Add your first relative, then build out parents, partners and children from their profile.' : 'No people in this tree yet.'} action={canEdit ? { label: 'Add your first relative', onClick: () => setAdding(true) } : undefined} />}

      {graph && matches && (
        <>
          <p className="mb-2 text-[15px] text-ink-mute">{matches.length === 0 ? `No one called “${q.trim()}” yet.` : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`}</p>
          {matches.length > 0 && <PeopleList people={matches} graph={graph} meId={meId} />}
        </>
      )}

      {graph && !matches && branches.length > 0 && (
        <>
          {branches.length > 2 && (
            <nav aria-label="Jump to a branch of the family" className="mb-6 flex flex-wrap gap-2">
              {branches.map((b) => (
                <a key={b.key} href={`#branch-${b.key}`} className="rounded-full border border-line bg-white px-3 py-1 text-[15px] text-ink-soft transition-colors hover:border-moss hover:bg-moss-light"
                  onClick={(e) => { e.preventDefault(); document.getElementById(`branch-${b.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
                  {b.title.replace(/’s family$/, '')}
                </a>
              ))}
            </nav>
          )}
          <div className="space-y-8">
            {branches.map((b) => (
              <section key={b.key} id={`branch-${b.key}`} className="scroll-mt-4">
                <header className="mb-2 flex items-baseline justify-between gap-3">
                  <div>
                    <h2 className="text-[22px] leading-tight text-ink">{b.title}</h2>
                    {b.note && <p className="text-[15px] text-ink-mute">{b.note}</p>}
                  </div>
                  <span className="shrink-0 text-[15px] text-ink-mute">{b.people.length} {b.people.length === 1 ? 'person' : 'people'}</span>
                </header>
                <PeopleList people={b.people} graph={graph} meId={meId} />
              </section>
            ))}
          </div>
        </>
      )}

      <SupportLine />
      {adding && (
        <Modal title="Add person" onClose={() => setAdding(false)}>
          <PersonForm submitting={create.isPending} submitLabel={saveLabel} onCancel={() => setAdding(false)} onSubmit={async (input) => {
            const id = newId()
            const r = await create.mutateAsync({ summary: `Add ${[input.given_names, input.surname].filter(Boolean).join(' ')} to the tree`, subject: id, changes: [{ table: 'people', op: 'insert', data: { ...input, id } }] })
            setAdding(false)
            if (r.status === 'approved') nav(`/trees/${treeId}/people/${id}`)
          }} />
        </Modal>
      )}
    </div>
  )
}

function PeopleList({ people, graph, meId }: { people: Person[]; graph: Graph; meId: string | null }) {
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-white">
      {people.map((p) => {
        const rel = p.id === meId ? 'you' : relationTo(graph, meId, p)
        return (
          <li key={p.id}>
            <Link to={p.id} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-moss-light/50">
              <Avatar person={p} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px]">{fullName(p)}{p.maiden_name && <span className="text-ink-mute"> (née {p.maiden_name})</span>}</span>
                {rel && <span className={`block text-[14px] ${rel === 'you' ? 'font-medium text-brass' : 'italic text-brass'}`}>{rel === 'you' ? 'You' : rel.replace(/^your /, 'Your ')}</span>}
              </span>
              <span className="shrink-0 text-[15px] text-ink-mute">{lifespan(p) || (p.is_living ? 'Living' : '')}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
