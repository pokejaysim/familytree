import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useCanEdit, useProfile } from '../lib/profile'
import { useMyRequests } from '../lib/changes'
import { hasReadForeword } from '../lib/welcome'
import { ADMIN_NAME } from '../config'

/**
 * A small checklist on the home page for new members: find yourself ("This is me"), read the foreword,
 * add something you know. Steps tick themselves off; the card goes once they're all done or the
 * member closes it (remembered per account on this device). View-only members get "ask to add" instead.
 */
export default function GettingStarted({ treeId, hasForeword, onFind, onRead }: { treeId: string; hasForeword: boolean; onFind: () => void; onRead: () => void }) {
  const { session } = useAuth()
  const uid = session?.user.id
  const { data: profile } = useProfile()
  const { data: mine } = useMyRequests(uid)
  const canEdit = useCanEdit()
  const hideKey = `sft-getting-started-closed:${uid}`
  const [closed, setClosed] = useState(() => { try { return !!localStorage.getItem(hideKey) } catch { return false } })
  if (!profile || !uid || closed || mine === undefined) return null

  const linked = profile.person_status === 'approved'
  const asked = profile.person_status === 'pending'
  const button = 'btn-ghost shrink-0'
  const steps: { done: boolean; title: string; text: string; action?: ReactNode }[] = [
    {
      done: linked || asked,
      title: 'Find yourself in the tree',
      text: linked ? 'Done. Your card is marked You, and every page says how that person is related to you.'
        : asked ? `Done. ${ADMIN_NAME} will confirm it’s you.`
        : 'Open your own page and tap This is me under your name.',
      action: !(linked || asked) && <button className={button} onClick={onFind}>Find yourself</button>,
    },
    ...(hasForeword ? [{
      done: hasReadForeword(treeId),
      title: 'Read the foreword',
      text: `A note from ${ADMIN_NAME} on how the tree began with Bernard’s book.`,
      action: <button className={button} onClick={onRead}>Read it</button>,
    }] : []),
    canEdit ? {
      done: mine.length > 0,
      title: 'Add something you know',
      text: `A date, a story or an old photo. ${ADMIN_NAME} checks each one before it goes in, so you can’t break anything.`,
      action: linked ? <Link className={button} to={`/trees/${treeId}/people/${profile.person_id}`}>Start with your page</Link> : <Link className={button} to="/contribute">See how</Link>,
    } : {
      done: false,
      title: 'Know something we’re missing?',
      text: `Your account can look around. If you’d like to add photos, dates or stories, ask ${ADMIN_NAME} to turn that on.`,
      action: <Link className={button} to="/help#message">Ask {ADMIN_NAME}</Link>,
    },
  ]
  const count = steps.filter((s) => s.done).length
  if (count === steps.length) return null
  const close = () => { try { localStorage.setItem(hideKey, '1') } catch { /* ignore */ } setClosed(true) }

  return (
    <aside aria-labelledby="getting-started" className="card w-full space-y-3 lg:col-span-2">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 id="getting-started" className="text-[22px] leading-tight">Getting started</h2>
          <p className="text-[15px] text-ink-mute">{count} of {steps.length} done</p>
        </div>
        <button className="flex h-9 w-9 items-center justify-center rounded-full text-ink-mute hover:bg-moss-light hover:text-moss" aria-label="Close the getting started list" onClick={close}><X size={18} /></button>
      </div>
      <ol className="divide-y divide-line">
        {steps.map((s) => (
          <li key={s.title} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex flex-1 gap-3">
              {s.done ? <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-moss" aria-label="Done" /> : <Circle size={22} className="mt-0.5 shrink-0 text-field" aria-label="Not done yet" />}
              <div>
                <p className={`text-[17px] ${s.done ? 'text-ink-mute' : 'text-ink'}`}>{s.title}</p>
                <p className="text-[15px] leading-snug text-ink-mute">{s.text}</p>
              </div>
            </div>
            {!s.done && s.action && <div className="pl-9 sm:pl-0">{s.action}</div>}
          </li>
        ))}
      </ol>
    </aside>
  )
}
