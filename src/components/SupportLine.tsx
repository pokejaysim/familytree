import { ADMIN_NAME, DONATE_URL } from '../config'

/** Small footer line inviting relatives to help with hosting costs. Hidden until DONATE_URL is set. */
export default function SupportLine() {
  if (!DONATE_URL) return null
  return (
    <p className="mt-10 text-center text-[13px] italic text-ink-mute">
      This site is kept online by {ADMIN_NAME}.{' '}
      <a href={DONATE_URL} target="_blank" rel="noreferrer" className="not-italic text-brass hover:underline">Chip in for hosting</a>
    </p>
  )
}
