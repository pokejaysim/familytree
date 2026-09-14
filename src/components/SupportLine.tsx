import { Link } from 'react-router-dom'
import { DONATE_URL } from '../config'

/** Coffee-cup-with-leaf line icon from Jason's coffee asset pack (currentColor). */
export function CoffeeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M7 14h16v7a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" />
      <path d="M23 15h2a4 4 0 0 1 0 8h-2M5 29h22M14 11c0-5 5-8 10-8-1 6-5 9-10 8ZM14 11l7-5" />
    </svg>
  )
}

/**
 * Invitation to help with hosting costs. Hidden until DONATE_URL is set.
 * `full`: the illustrated footer (art + heading + button) for list pages. `compact`: a single line for the reading pane.
 */
export default function SupportLine({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  if (!DONATE_URL) return null
  const art = `${import.meta.env.BASE_URL}art/coffee-cup`
  if (variant === 'compact')
    return (
      <p className="mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-line pt-6 text-center text-[15px] italic text-ink-mute">
        <CoffeeIcon className="h-6 w-6 text-moss" />
        <span>Optional donations help cover development and hosting.</span>
        <a href={DONATE_URL} target="_blank" rel="noreferrer" className="not-italic text-brass underline decoration-1 underline-offset-4 hover:text-moss">Donate via Buy Me a Coffee ↗</a>
      </p>
    )
  return (
    <aside aria-label="Support this family website" className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 border-y border-line py-6 text-center sm:flex-nowrap sm:text-left">
      <img src={`${art}-480.webp`} srcSet={`${art}-480.webp 480w, ${art}-960.webp 960w`} sizes="156px" width={156} height={117} alt="" className="shrink-0" />
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <h2 className="text-[22px] leading-tight text-ink">Help keep our family tree online.</h2>
        <p className="mt-1 text-[15px] text-ink-mute">Optional donations help cover development and hosting.</p>
        <Link to="/support" className="mt-2 inline-block text-[12px] uppercase tracking-[.12em] text-brass underline underline-offset-4 hover:text-moss">Where it goes</Link>
      </div>
      <a href={DONATE_URL} target="_blank" rel="noreferrer" className="btn-primary min-h-[44px] shrink-0 px-5">
        <CoffeeIcon className="h-5 w-5" /> Donate via Buy Me a Coffee
      </a>
    </aside>
  )
}
