import { useState, type FormEvent } from 'react'
import type { Source } from '../lib/types'

export default function SourceForm({ initial, onSubmit, onCancel, submitting }: { initial?: Partial<Source>; onSubmit: (s: Partial<Source>) => void; onCancel: () => void; submitting?: boolean }) {
  const [f, setF] = useState({
    title: initial?.title ?? '', author: initial?.author ?? '', publication: initial?.publication ?? '',
    repository: initial?.repository ?? '', url: initial?.url ?? '', notes: initial?.notes ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const nz = (s: string) => (s.trim() ? s.trim() : null)
    onSubmit({ title: f.title.trim(), author: nz(f.author), publication: nz(f.publication), repository: nz(f.repository), url: nz(f.url), notes: nz(f.notes) })
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div><label className="label">Title</label><input className="input" required value={f.title} onChange={set('title')} placeholder="e.g. Letter from Grandpa to LKC, 1 Oct 2002" autoFocus /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Author</label><input className="input" value={f.author} onChange={set('author')} /></div>
        <div><label className="label">Publication / date</label><input className="input" value={f.publication} onChange={set('publication')} /></div>
      </div>
      <div><label className="label">Repository (where the original is)</label><input className="input" value={f.repository} onChange={set('repository')} placeholder="e.g. Grandpa's floppy disks, family archive box 2" /></div>
      <div><label className="label">URL</label><input className="input" value={f.url} onChange={set('url')} /></div>
      <div><label className="label">Notes</label><textarea className="input min-h-20" value={f.notes} onChange={set('notes')} /></div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}
