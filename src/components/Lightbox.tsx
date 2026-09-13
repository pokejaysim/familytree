import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Media } from '../lib/types'
import { useSignedUrl } from '../lib/queries'

/** Full-screen photo viewer for a person's gallery: as large as the screen allows, with arrows and keyboard navigation. */
export default function Lightbox({ items, index, onIndex, onClose }: { items: Media[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const m = items[index]
  const { data: url } = useSignedUrl(m?.storage_path)
  const prev = () => onIndex((index - 1 + items.length) % items.length)
  const next = () => onIndex((index + 1) % items.length)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next() }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  })
  if (!m) return null
  const isImg = m.mime_type?.startsWith('image/')
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/95 text-cream" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <span className="text-cream/70">{index + 1} of {items.length}</span>
        <button className="rounded-full p-2 hover:bg-white/10" onClick={onClose} aria-label="Close"><X size={20} /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16" onClick={(e) => e.stopPropagation()}>
        {url && (isImg
          ? <img src={url} alt={m.caption ?? ''} className="max-h-full max-w-full object-contain" style={{ imageRendering: 'auto' }} />
          : <a href={url} target="_blank" rel="noreferrer" className="btn-primary">Open document</a>)}
        {items.length > 1 && (<>
          <button className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20 sm:left-4" onClick={prev} aria-label="Previous"><ChevronLeft size={24} /></button>
          <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20 sm:right-4" onClick={next} aria-label="Next"><ChevronRight size={24} /></button>
        </>)}
      </div>
      {m.caption && <p className="px-6 py-4 text-center text-[15px] italic text-cream/80" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>{m.caption}</p>}
    </div>
  )
}
