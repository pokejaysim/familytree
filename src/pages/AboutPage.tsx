import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { useTree } from '../lib/queries'
import { useIsAdmin } from '../lib/profile'
import divider from '../assets/branch-divider.svg'
import { Letter } from '../components/IntroPane'
import TreeSettingsForm from '../components/TreeSettingsForm'

/** The tree's introduction: for the Sim family, Bernard's preface to the family book, reproduced as he wrote it. */
export default function AboutPage() {
  const { treeId = '' } = useParams()
  const { data: tree } = useTree(treeId)
  const canEdit = useIsAdmin()
  const [editing, setEditing] = useState(false)

  if (!tree) return <p className="p-6 text-ink-mute">Loading…</p>
  if (editing)
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <TreeSettingsForm tree={tree} tall onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </div>
    )

  return (
    <article className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8 text-center">
        <p className="text-[22px] text-ink">{tree.name}</p>
        {tree.description && <p className="mt-2 text-ink-mute">{tree.description}</p>}
      </header>
      {tree.foreword && (
        <section className="mb-12">
          <h1 className="text-center text-3xl sm:text-4xl">{tree.foreword_title || 'Foreword'}</h1>
          <img src={divider} alt="" width={200} height={20} className="mx-auto mt-4 mb-6 opacity-90" />
          <Letter text={tree.foreword} />
          {tree.foreword_byline && <p className="mt-6 text-right italic text-ink-mute">{tree.foreword_byline}</p>}
        </section>
      )}
      {tree.intro ? (
        <section>
          <h1 className="text-center text-3xl sm:text-4xl">{tree.intro_title || 'Introduction'}</h1>
          <img src={divider} alt="" width={200} height={20} className="mx-auto mt-4 mb-6 opacity-90" />
          <Letter text={tree.intro} />
          {tree.intro_byline && <p className="mt-6 text-right italic text-ink-mute">{tree.intro_byline}</p>}
        </section>
      ) : !tree.foreword && (
        <p className="text-center text-ink-mute">No introduction has been written yet.</p>
      )}
      {canEdit && <div className="mt-10 text-center"><button className="btn-ghost" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button></div>}
    </article>
  )
}
