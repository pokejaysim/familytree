import { useState, type FormEvent } from 'react'
import { useUpdateTree } from '../lib/queries'
import type { Tree } from '../lib/types'

const FIELDS = ['name', 'description', 'foreword_title', 'foreword', 'foreword_byline', 'intro_title', 'intro', 'intro_byline'] as const
type Field = (typeof FIELDS)[number]
const fromTree = (t: Tree) => Object.fromEntries(FIELDS.map((k) => [k, t[k] ?? ''])) as Record<Field, string>

/**
 * The tree's name, its one-line description, the foreword and the introduction (for the Sim family,
 * Bernard's preface). Used on the Admin page and on the tree's About page.
 */
export default function TreeSettingsForm({ tree, onSaved, onCancel, tall }: { tree: Tree; onSaved?: () => void; onCancel?: () => void; tall?: boolean }) {
  const update = useUpdateTree(tree.id)
  const [f, setF] = useState(() => fromTree(tree))
  const [saved, setSaved] = useState(false)
  const start = fromTree(tree)
  const changed = FIELDS.some((k) => f[k] !== start[k])
  const set = (k: Field) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setSaved(false) }
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const nz = (s: string) => (s.trim() ? s.trim() : null)
    await update.mutateAsync({
      name: f.name.trim(), description: nz(f.description),
      foreword_title: nz(f.foreword_title), foreword: nz(f.foreword), foreword_byline: nz(f.foreword_byline),
      intro_title: nz(f.intro_title), intro: nz(f.intro), intro_byline: nz(f.intro_byline),
    })
    setSaved(true)
    onSaved?.()
  }
  const box = tall ? 'min-h-[40vh]' : 'min-h-56'
  return (
    <form onSubmit={save} className="space-y-4">
      <label className="block"><span className="label">Name of the tree</span><input className="input" required value={f.name} onChange={set('name')} /></label>
      <label className="block"><span className="label">About this tree (one line, shown on the home page)</span><input className="input" value={f.description} onChange={set('description')} /></label>
      <h3 className="pt-2 text-[19px] text-ink">Foreword</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Title</span><input className="input" value={f.foreword_title} onChange={set('foreword_title')} placeholder="e.g. A note from Jason" /></label>
        <label className="block"><span className="label">Signed</span><input className="input" value={f.foreword_byline} onChange={set('foreword_byline')} placeholder="e.g. Jason Sim, September 2026" /></label>
      </div>
      <label className="block"><span className="label">Text</span><textarea className={`input ${box} leading-relaxed`} value={f.foreword} onChange={set('foreword')} /></label>
      <h3 className="pt-2 text-[19px] text-ink">Introduction</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Title</span><input className="input" value={f.intro_title} onChange={set('intro_title')} placeholder="e.g. Preface" /></label>
        <label className="block"><span className="label">Signed</span><input className="input" value={f.intro_byline} onChange={set('intro_byline')} placeholder="e.g. B.M. Sim, June 2007" /></label>
      </div>
      <label className="block"><span className="label">Text</span><textarea className={`input ${box} leading-relaxed`} value={f.intro} onChange={set('intro')} /></label>
      <p className="text-[15px] text-ink-mute">Leave a blank line between paragraphs. Leaving the text empty hides that part.</p>
      {update.error && <p role="alert" className="text-[15px] text-danger">{update.error.message}</p>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {saved && !changed && <span role="status" className="text-[15px] text-moss">Saved</span>}
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
        <button className="btn-primary" disabled={update.isPending || !changed || !f.name.trim()}>Save changes</button>
      </div>
    </form>
  )
}
