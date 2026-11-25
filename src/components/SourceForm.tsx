import { useState, type FormEvent } from 'react'
import type { Source } from '../lib/types'

export default function SourceForm({ initial, onSubmit, onCancel, submitting, submitLabel = 'Save' }: { initial?: Partial<Source>; onSubmit: (s: Partial<Source>) => void; onCancel: () => void; submitting?: boolean; submitLabel?: string }) {
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
      <label className="block"><span className="label">Title</span><input className="input" required value={f.title} onChange={set('title')} placeholder="e.g. Letter from Grandpa to LKC, 1 Oct 2002" autoFocus /></label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Author</span><input className="input" value={f.author} onChange={set('author')} /></label>
        <label className="block"><span className="label">Publication / date</span><input className="input" value={f.publication} onChange={set('publication')} /></label>
      </div>
      <label className="block"><span className="label">Repository (where the original is)</span><input className="input" value={f.repository} onChange={set('repository')} placeholder="e.g. Grandpa’s floppy disks, family archive box 2" /></label>
      <label className="block"><span className="label">URL</span><input className="input" value={f.url} onChange={set('url')} /></label>
      <label className="block"><span className="label">Notes</span><textarea className="input min-h-20" value={f.notes} onChange={set('notes')} /></label>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={submitting}>{submitting ? 'Sending…' : submitLabel}</button>
      </div>
    </form>
  )
}
