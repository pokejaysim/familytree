import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { useCreateTree, useTrees } from '../lib/queries'
import { useCanEdit } from '../lib/profile'
import AppHeader from '../components/AppHeader'
import SupportLine from '../components/SupportLine'
import Modal from '../components/Modal'

export default function TreesPage() {
  const { data: trees, isLoading, error } = useTrees()
  const create = useCreateTree()
  const canEdit = useCanEdit()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  return (
    <div className="flex h-full flex-col">
    <AppHeader />
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-auto p-4 sm:p-6">
      <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-serif text-3xl">Family trees</h1>
        {canEdit && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New tree</button>}
      </header>
      {isLoading && <p className="text-ink/50">Loading…</p>}
      {error && <p className="text-red-700">{error.message}</p>}
      {trees?.length === 0 && (
        <EmptyState art="first-branch" title="Begin with one connection." text={canEdit ? 'Every family tree starts with someone. Create a tree, then add your first relative.' : 'No trees have been shared with you yet.'} action={canEdit ? { label: 'Create a tree', onClick: () => setOpen(true) } : undefined} />
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {trees?.map((t) => (
          <li key={t.id}>
            <Link to={`/trees/${t.id}`} className="card block hover:border-moss">
              <h2 className="font-serif text-xl">{t.name}</h2>
              {t.description && <p className="mt-1 text-sm text-ink/60">{t.description}</p>}
            </Link>
          </li>
        ))}
      </ul>
      <SupportLine />
      {open && (
        <Modal title="New family tree" onClose={() => setOpen(false)}>
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await create.mutateAsync({ name, description: desc || undefined }); setOpen(false); setName(''); setDesc('') }}>
            <div><label className="label">Name</label><input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Sim family" autoFocus /></div>
            <div><label className="label">Description</label><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            {create.error && <p className="text-sm text-red-700">{create.error.message}</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={create.isPending}>Create</button></div>
          </form>
        </Modal>
      )}
    </div>
    </div>
  )
}
