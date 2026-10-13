import { useSyncExternalStore } from 'react'
import { CheckCircle2, Clock3, X } from 'lucide-react'

/** Tiny app-wide notice: "Sent to Jason for review", "Saved". One at a time, fades after a few seconds. */
type Toast = { id: number; tone: 'saved' | 'review' | 'error'; title: string; body?: string }
let current: Toast | null = null
let timer: number | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(tone: Toast['tone'], title: string, body?: string) {
  current = { id: Date.now(), tone, title, body }
  window.clearTimeout(timer)
  timer = window.setTimeout(() => { current = null; emit() }, tone === 'review' ? 7000 : 4000)
  emit()
}

export function Toaster() {
  const t = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => current)
  if (!t) return null
  const Icon = t.tone === 'review' ? Clock3 : CheckCircle2
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 sm:bottom-8" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div key={t.id} role="status" className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-md border px-4 py-3 shadow-lg ${t.tone === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-line bg-white text-ink'}`} style={{ animation: 'riseIn .3s cubic-bezier(.2,.8,.2,1)' }}>
        <Icon size={18} className={`mt-0.5 shrink-0 ${t.tone === 'review' ? 'text-brass' : t.tone === 'error' ? 'text-red-700' : 'text-moss'}`} />
        <div className="min-w-0">
          <p className="text-[15px]">{t.title}</p>
          {t.body && <p className="mt-0.5 text-[13px] text-ink-mute">{t.body}</p>}
        </div>
        <button className="ml-1 shrink-0 rounded p-0.5 text-ink-mute hover:bg-paper" aria-label="Dismiss" onClick={() => { current = null; emit() }}><X size={14} /></button>
      </div>
    </div>
  )
}
