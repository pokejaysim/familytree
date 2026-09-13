import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import type { Tree } from '../lib/types'
import divider from '../assets/branch-divider.svg'

/** Paragraphs separated by blank lines; a paragraph wrapped in quotation marks becomes a block quote. */
export function Letter({ text }: { text: string }) {
  return (
    <div className="space-y-5 text-[17px] leading-relaxed text-ink-soft">
      {text.split(/\n\s*\n/).map((para, i) => {
        let t = para.trim()
        // Light markup: **date line**, *italic quote*, or a paragraph wrapped in quotation marks → block quote
        if (/^\*\*.+\*\*$/s.test(t)) return <p key={i} className="text-[12px] uppercase tracking-[.12em] text-brass">{t.slice(2, -2)}</p>
        const starred = /^\*[^*].*\*$/s.test(t)
        if (starred) t = t.slice(1, -1)
        const quoted = starred || /^["“].*["”]$/s.test(t)
        return quoted
          ? <blockquote key={i} className="border-l-2 border-brass-light pl-4 italic text-ink-mute">{t}</blockquote>
          : <p key={i} className="whitespace-pre-wrap">{t}</p>
      })}
    </div>
  )
}

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
        <p className="text-center text-[12px] uppercase tracking-[.12em] text-brass">{tree.name}</p>
        {tree.foreword && (
          <section className="mb-12">
            <header className="mb-6 text-center">
              <h1 className="mt-1 text-3xl sm:text-4xl">{tree.foreword_title || 'Foreword'}</h1>
              <img src={divider} alt="" width={200} height={20} className="mx-auto mt-4 opacity-90" />
            </header>
            <Letter text={tree.foreword} />
            {tree.foreword_byline && <p className="mt-6 text-right italic text-ink-mute">{tree.foreword_byline}</p>}
          </section>
        )}
        {tree.intro && (
          <section>
            <header className="mb-6 text-center">
              <h1 className="mt-1 text-3xl sm:text-4xl">{tree.intro_title || 'Introduction'}</h1>
              <img src={divider} alt="" width={200} height={20} className="mx-auto mt-4 opacity-90" />
            </header>
            <Letter text={tree.intro} />
            {tree.intro_byline && <p className="mt-6 text-right italic text-ink-mute">{tree.intro_byline}</p>}
          </section>
        )}
        <div className="mt-10 flex justify-center gap-3">
          <button className="btn-primary" onClick={onClose}>Open the map</button>
          {canEdit && <Link to={`/trees/${tree.id}/about`} className="btn-ghost">Edit</Link>}
        </div>
      </article>
    </div>
  )
}
