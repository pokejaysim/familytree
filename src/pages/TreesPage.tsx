import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, GitFork, Plus, Search } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { useCreateTree, useTree, useTreeData, useTrees } from '../lib/queries'
import { useIsAdmin } from '../lib/profile'
import { buildGraph, type Graph } from '../lib/graph'
import { fullName, lifespan } from '../lib/dates'
import type { Person } from '../lib/types'
import AppHeader from '../components/AppHeader'
import SupportLine from '../components/SupportLine'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import PersonPicker from '../components/PersonPicker'
import IntroPane from '../components/IntroPane'

/** Home. With one family tree it is that family's cover; with several it lists them. */
export default function TreesPage() {
  const { data: trees, isLoading, error } = useTrees()
  const create = useCreateTree()
  const canEdit = useIsAdmin()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const only = trees?.length === 1 ? trees[0] : null

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <div className="flex flex-1 flex-col overflow-auto">
        {only ? <Cover treeId={only.id} /> : (
          <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
            <header className="mb-6 sm:mb-8">
              <h1 className="font-serif text-3xl">Family trees</h1>
            </header>
            {isLoading && <p className="text-ink-mute">Loading…</p>}
            {error && <p className="text-danger">{error.message}</p>}
            {trees?.length === 0 && (
              <EmptyState art="first-branch" title="Begin with one connection." text={canEdit ? 'Every family tree starts with someone. Create a tree, then add your first relative.' : 'No trees have been shared with you yet.'} action={canEdit ? { label: 'Create a tree', onClick: () => setOpen(true) } : undefined} />
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {trees?.map((t) => (
                <li key={t.id}>
                  <Link to={`/trees/${t.id}`} className="card block transition-colors hover:border-moss">
                    <h2 className="font-serif text-xl">{t.name}</h2>
                    {t.description && <p className="mt-1 text-[15px] text-ink-mute">{t.description}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-8">
          <p className="mt-2 text-[16px] text-ink-soft">Know a name, a date or a story? <Link to="/contribute" className="text-brass underline underline-offset-4 hover:text-moss">Here’s how to add it</Link>.</p>
          {canEdit && trees && trees.length > 0 && <button className="btn-ghost mt-4" onClick={() => setOpen(true)}><Plus size={16} /> Start another tree</button>}
          <SupportLine variant="compact" />
        </div>
      </div>
      {open && (
        <Modal title="New family tree" onClose={() => setOpen(false)}>
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await create.mutateAsync({ name, description: desc || undefined }); setOpen(false); setName(''); setDesc('') }}>
            <div><label className="label">Name</label><input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Sim family" autoFocus /></div>
            <div><label className="label">Description</label><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            {create.error && <p className="text-[15px] text-danger">{create.error.message}</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={create.isPending}>Create</button></div>
          </form>
        </Modal>
      )}
    </div>
  )
}

const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

/** The founding couple: the parentless person with the most children, and their partner(s). */
function foundersOf(graph: Graph): Person[] {
  const roots = [...graph.people.values()].filter((p) => graph.parentsOf(p.id).length === 0)
  const f = roots.sort((a, b) => graph.childrenOf(b.id).length - graph.childrenOf(a.id).length)[0]
  if (!f || graph.childrenOf(f.id).length === 0) return []
  const partners = (graph.familiesOfParent.get(f.id) ?? []).map((fam) => graph.partnerOf(fam, f.id)).filter((q): q is Person => !!q)
  return [f, ...partners.slice(0, 1)]
}

/** Generations from the founders down, counting them as the first. */
function generationsBelow(graph: Graph, founder: Person): number {
  let depth = 0
  const walk = (p: Person, d: number, seen: Set<string>) => {
    if (seen.has(p.id)) return
    seen.add(p.id); depth = Math.max(depth, d)
    graph.childrenOf(p.id).forEach((c) => walk(c, d + 1, seen))
  }
  walk(founder, 1, new Set())
  return depth
}

/** The family's front page: who they are, where they began, and the way into the map. */
function Cover({ treeId }: { treeId: string }) {
  const nav = useNavigate()
  const { data: tree } = useTree(treeId)
  const { data } = useTreeData(treeId)
  const isAdmin = useIsAdmin()
  const graph = useMemo(() => (data ? buildGraph(data) : null), [data])
  const founders = useMemo(() => (graph ? foundersOf(graph) : []), [graph])
  const gens = graph && founders[0] ? generationsBelow(graph, founders[0]) : 0
  const [finding, setFinding] = useState(false)
  const [reading, setReading] = useState(false)
  if (!tree) return <p className="p-6 text-ink-mute">Loading…</p>

  return (
    <section className="mx-auto grid w-full max-w-5xl flex-1 content-center items-center gap-8 px-4 py-8 sm:px-8 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
      {founders.length > 0 && (
        <figure className="order-first flex justify-center gap-4 sm:gap-8 lg:order-last">
          {founders.map((p) => (
            <Link key={p.id} to={`/trees/${treeId}/people/${p.id}`} className="group flex min-w-0 flex-col items-center text-center">
              <span className="rounded-full p-1 ring-1 ring-line transition-colors group-hover:ring-brass">
                <span className="hidden sm:block"><Avatar person={p} size={200} /></span>
                <span className="sm:hidden"><Avatar person={p} size={120} /></span>
              </span>
              <span className="mt-3 text-[18px] leading-tight text-ink">{fullName(p)}</span>
              <span className="text-[15px] text-ink-mute">{lifespan(p)}</span>
            </Link>
          ))}
        </figure>
      )}
      <div className="min-w-0">
        <h1 className="text-[40px] leading-[1.05] text-ink [overflow-wrap:break-word] sm:text-[56px]">{tree.name}</h1>
        {tree.description && <p className="mt-4 max-w-[46ch] text-[18px] leading-relaxed text-ink-soft">{tree.description}</p>}
        {graph && gens > 0 && <p className="mt-3 text-[16px] text-ink-mute">{graph.people.size} people across {WORDS[gens] ?? gens} generations so far.</p>}
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to={`/trees/${treeId}/chart`} className="btn-primary min-h-11 px-5 text-[16px]"><GitFork size={18} /> Open the map</Link>
          {data && <button className="btn-ghost min-h-11 px-5 text-[16px]" onClick={() => setFinding(true)}><Search size={17} /> Find a relative</button>}
        </div>
        {(tree.foreword || tree.intro) && (
          <button className="mt-5 flex items-center gap-2 text-[16px] text-brass underline underline-offset-4 hover:text-moss" onClick={() => setReading(true)}>
            <BookOpen size={17} /> Read {tree.foreword && tree.intro ? 'the foreword and preface' : tree.foreword ? 'the foreword' : 'the introduction'}
          </button>
        )}
      </div>
      {finding && data && (
        <Modal title="Find a relative" onClose={() => setFinding(false)}>
          <PersonPicker people={data.people} placeholder="Type a name" onPick={(p) => nav(`/trees/${treeId}/people/${p.id}`)} />
        </Modal>
      )}
      {reading && <IntroPane tree={tree} canEdit={isAdmin} onClose={() => setReading(false)} onOpenMap={() => nav(`/trees/${treeId}/chart`)} />}
    </section>
  )
}
