import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { useTree, useUpdateTree } from '../lib/queries'
import { useCanEdit } from '../lib/profile'
import divider from '../assets/branch-divider.svg'

/** The tree's introduction: for the Sim family, Bernard's preface to the family book, reproduced as he wrote it. */
export default function AboutPage() {
  const { treeId = '' } = useParams()
  const { data: tree } = useTree(treeId)
  const update = useUpdateTree(treeId)
  const canEdit = useCanEdit()
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ intro_title: '', intro: '', intro_byline: '', description: '' })

  if (!tree) return <p className="p-6 text-ink-mute">Loading…</p>
  const startEdit = () => { setF({ intro_title: tree.intro_title ?? '', intro: tree.intro ?? '', intro_byline: tree.intro_byline ?? '', description: tree.description ?? '' }); setEditing(true) }
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const nz = (s: string) => (s.trim() ? s.trim() : null)
    await update.mutateAsync({ intro_title: nz(f.intro_title), intro: nz(f.intro), intro_byline: nz(f.intro_byline), description: nz(f.description) })
    setEditing(false)
  }

  if (editing)
    return (
      <form onSubmit={save} className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <div><label className="label">About this tree (one line)</label><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">Introduction title</label><input className="input" value={f.intro_title} onChange={(e) => setF({ ...f, intro_title: e.target.value })} placeholder="e.g. Preface" /></div>
          <div><label className="label">Signed</label><input className="input" value={f.intro_byline} onChange={(e) => setF({ ...f, intro_byline: e.target.value })} placeholder="e.g. B.M. Sim, June 2007" /></div>
        </div>
        <div><label className="label">Introduction text</label><textarea className="input min-h-[60vh] leading-relaxed" value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} /></div>
        {update.error && <p className="text-sm text-red-800">{update.error.message}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button><button className="btn-primary" disabled={update.isPending}>Save</button></div>
      </form>
    )

  return (
    <article className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 text-center">
        <p className="text-[12px] uppercase tracking-[.12em] text-brass">{tree.name}</p>
        <h1 className="mt-1 text-3xl sm:text-4xl">{tree.intro_title || 'About this tree'}</h1>
        {tree.description && <p className="mt-2 text-ink-mute">{tree.description}</p>}
        <img src={divider} alt="" width={200} height={20} className="mx-auto mt-4 opacity-90" />
      </header>
      {tree.intro ? (
        <div className="whitespace-pre-wrap text-[17px] leading-relaxed text-ink-soft">{tree.intro}</div>
      ) : (
        <p className="text-center text-ink-mute">No introduction has been written yet.</p>
      )}
      {tree.intro_byline && <p className="mt-8 text-right italic text-ink-mute">{tree.intro_byline}</p>}
      {canEdit && <div className="mt-10 text-center"><button className="btn-ghost" onClick={startEdit}><Pencil size={14} /> Edit</button></div>}
    </article>
  )
}
