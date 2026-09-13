import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import type { Tree } from '../lib/types'
import divider from '../assets/branch-divider.svg'

/** Reading pane for the tree's introduction (for the Sim family, Bernard's preface), opened from the map. */
export default function IntroPane({ tree, canEdit, onClose }: { tree: Tree; canEdit: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <article
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-paper px-5 pt-8 pb-10 shadow-2xl sm:max-h-[85vh] sm:max-w-2xl sm:rounded-md sm:px-12 sm:pt-12"
        style={{ animation: 'riseIn .3s cubic-bezier(.2,.8,.2,1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-3 right-3 rounded-full p-1.5 text-ink-mute hover:bg-white" aria-label="Close"><X size={16} /></button>
        <header className="mb-8 text-center">
          <p className="text-[12px] uppercase tracking-[.12em] text-brass">{tree.name}</p>
          <h1 className="mt-1 text-3xl sm:text-4xl">{tree.intro_title || 'Introduction'}</h1>
          <img src={divider} alt="" width={200} height={20} className="mx-auto mt-4 opacity-90" />
        </header>
        <div className="whitespace-pre-wrap text-[17px] leading-relaxed text-ink-soft">{tree.intro}</div>
        {tree.intro_byline && <p className="mt-8 text-right italic text-ink-mute">{tree.intro_byline}</p>}
        <div className="mt-10 flex justify-center gap-3">
          <button className="btn-primary" onClick={onClose}>Open the map</button>
          {canEdit && <Link to={`/trees/${tree.id}/about`} className="btn-ghost">Edit</Link>}
        </div>
      </article>
    </div>
  )
}
