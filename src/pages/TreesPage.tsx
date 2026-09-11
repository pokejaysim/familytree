import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, Plus, TreeDeciduous } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useCreateTree, useTrees } from '../lib/queries'
import Modal from '../components/Modal'

export default function TreesPage() {
  const { data: trees, isLoading, error } = useTrees()
  const create = useCreateTree()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="font-serif text-3xl">Your family trees</h1>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> New tree</button>
          <button className="btn-ghost" onClick={() => supabase.auth.signOut()}><LogOut size={16} /> Sign out</button>
        </div>
      </header>
      {isLoading && <p className="text-ink/50">Loading…</p>}
      {error && <p className="text-red-700">{error.message}</p>}
      {trees?.length === 0 && (
        <div className="card text-center text-ink/60">
          <TreeDeciduous className="mx-auto mb-2 text-moss" size={40} />
          No trees yet. Create one to start adding people.
        </div>
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
      {open && (
        <Modal title="New family tree" onClose={() => setOpen(false)}>
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await create.mutateAsync({ name, description: desc || undefined }); setOpen(false); setName(''); setDesc('') }}>
            <div><label className="label">Name</label><input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Sim family" autoFocus /></div>
            <div><label className="label">Description</label><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={create.isPending}>Create</button></div>
          </form>
        </Modal>
      )}
    </div>
  )
}
