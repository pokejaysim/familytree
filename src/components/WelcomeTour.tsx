import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CalendarDays, Camera, Check, PenLine, UserRound } from 'lucide-react'
import Avatar from './Avatar'
import { buildGraph, type Graph } from '../lib/graph'
import { foundersOf, generationsBelow, relationTo, WORDS } from '../lib/kin'
import { TREE } from '../lib/splash'
import type { Person } from '../lib/types'
import type { TreeData } from '../lib/queries'
import { ADMIN_NAME } from '../config'

/**
 * A short welcome for new members: four cards, each with a small scene that plays as it appears.
 * Shown once per member on each device (App.tsx decides when); "Watch the welcome again" on the
 * Contribute page replays it. Written in Jason's voice, like the Contribute page.
 * Animations live in index.css (.wt-*) and are skipped for people who prefer reduced motion.
 */
export default function WelcomeTour({ data, meId, role, onClose, onOpenMap }: {
  data: TreeData | undefined
  meId: string | null
  role: 'admin' | 'editor' | 'viewer'
  onClose: () => void
  onOpenMap: (() => void) | null
}) {
  const graph = useMemo(() => (data ? buildGraph(data) : null), [data])
  const founders = useMemo(() => (graph ? foundersOf(graph) : []), [graph])
  const me = (meId && graph?.people.get(meId)) || null
  const [step, setStep] = useState(0)
  const next = useRef<HTMLButtonElement>(null)

  const gens = graph && founders[0] ? generationsBelow(graph, founders[0]) : 0
  const founderNames = founders.map((f) => f.nickname || f.given_names.split(' ')[0]).join(' and ')
  const cards: { title: string; text: ReactNode; scene: ReactNode }[] = [
    {
      title: 'Welcome to the family tree',
      text: <>{graph && gens > 0 ? `${graph.people.size} people across ${WORDS[gens] ?? gens} generations, starting with ${founderNames}. ` : ''}It began with Bernard’s family book, and now the whole family can add to it.</>,
      scene: <GrowScene founders={founders} />,
    },
    {
      title: 'Find your way around the map',
      text: <>Everyone is on the map. Drag to move around, pinch or scroll to zoom, and tap anyone to open their page. If you’d rather have a plain list, it’s under <b className="font-medium">People</b>.</>,
      scene: <MapScene />,
    },
    me ? {
      title: 'You’re on the map',
      text: <>Your card is marked <b className="font-medium">You</b>, and every page says how that person is related to you.</>,
      scene: <YouScene me={me} graph={graph} />,
    } : {
      title: 'Find yourself',
      text: <>Look yourself up and tap <b className="font-medium">This is me</b> under your name. Once I’ve confirmed it, the map starts from you and every page says how that person is related to you.</>,
      scene: <YouScene me={null} graph={graph} />,
    },
    role === 'viewer' ? {
      title: 'Know something we’re missing?',
      text: <>Your account can look around for now. If you’d like to add photos, dates or stories, just ask me and I’ll turn that on.</>,
      scene: <AddScene last="Ask Jason to turn on adding" />,
    } : {
      title: 'Add what you know',
      text: role === 'admin'
        ? <>Know a date, remember a story, or have an old photo? Add it on anyone’s page. Your changes go in straight away, and you can undo any of them from the Admin page.</>
        : <>Know a date, remember a story, or have an old photo? Add it on anyone’s page. I look over every change before it goes in, so don’t worry about getting something wrong.</>,
      scene: <AddScene last={role === 'admin' ? 'Goes in straight away' : `${ADMIN_NAME} looks it over`} />,
    },
  ]
  const last = step === cards.length - 1
  const card = cards[step]

  useEffect(() => { next.current?.focus() }, [step])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setStep((s) => Math.min(s + 1, cards.length - 1))
      else if (e.key === 'ArrowLeft') setStep((s) => Math.max(s - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, cards.length])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="wt-title" className="wt-panel w-full max-w-md overflow-hidden rounded-xl bg-white shadow-sheet">
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-[14px] text-ink-mute">{step + 1} of {cards.length}</span>
          <button className="text-[15px] text-ink-mute underline underline-offset-4 hover:text-moss" onClick={onClose}>Skip</button>
        </div>
        {/* key: each card's scene plays from the start when it appears */}
        <div key={step}>
          <div className="mx-5 mt-3 flex h-44 items-center justify-center overflow-hidden rounded-lg bg-paper" aria-hidden="true">{card.scene}</div>
          <div className="min-h-[9.5rem] px-6 pt-5">
            <h2 id="wt-title" className="wt-in text-[24px] leading-tight text-ink" style={{ '--d': '120ms' } as CSSProperties}>{card.title}</h2>
            <p className="wt-in mt-2 text-[16px] leading-relaxed text-ink-soft" style={{ '--d': '220ms' } as CSSProperties}>{card.text}</p>
            {last && <p className="mt-3 text-[14px] text-ink-mute">You can watch this again any time from How to contribute.</p>}
          </div>
        </div>
        <div className="mt-6 flex items-center gap-2 border-t border-line px-5 py-4">
          <div className="flex gap-1.5" aria-hidden="true">
            {cards.map((_, i) => <span key={i} className={`h-2 w-2 rounded-full transition-colors ${i === step ? 'bg-moss' : 'bg-line'}`} />)}
          </div>
          <div className="ml-auto flex gap-2">
            {step > 0 && <button className="btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
            {!last
              ? <button ref={next} className="btn-primary" onClick={() => setStep(step + 1)}>Next</button>
              : onOpenMap
                ? <button ref={next} className="btn-primary" onClick={onOpenMap}>Open the map</button>
                : <button ref={next} className="btn-primary" onClick={onClose}>Done</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

const d = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties

/** The splash tree grows, then the founding couple appear either side of it. */
function GrowScene({ founders }: { founders: Person[] }) {
  // The splash's tree, with its classes renamed to this tour's animations.
  const tree = TREE.replace(/class="leaf" style="--delay:(\d+)ms"/g, 'class="wt-leaf" style="--d:$1ms"').replace('class="trunk"', 'class="wt-trunk"')
  const [a, b] = founders
  return (
    <div className="flex items-center gap-4">
      {a && <div className="wt-pop" style={d(900)}><Avatar person={a} size={64} /></div>}
      <div className="h-28 w-28" dangerouslySetInnerHTML={{ __html: tree.replace('<svg ', '<svg width="112" height="112" ') }} />
      {b && <div className="wt-pop" style={d(1000)}><Avatar person={b} size={64} /></div>}
    </div>
  )
}

/** A tiny map: the founders, their children and a grandchild join up, then a tap lands on one card. */
function MapScene() {
  const box = (x: number, y: number, delay: number, mark = false) => (
    <g className="wt-pop" style={{ ...d(delay), transformBox: 'fill-box', transformOrigin: 'center' }}>
      <rect x={x} y={y} width={60} height={26} rx={5} className={mark ? 'fill-white stroke-brass' : 'fill-white stroke-line'} strokeWidth={mark ? 2 : 1.25} />
      <rect x={x + 8} y={y + 8} width={30} height={4} rx={2} className="fill-ink-mute/40" />
      <rect x={x + 8} y={y + 15} width={20} height={3} rx={1.5} className="fill-ink-mute/25" />
    </g>
  )
  const line = (x1: number, y1: number, x2: number, y2: number, delay: number) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} pathLength={1} className="wt-draw stroke-moss/60" strokeWidth={1.5} style={d(delay)} />
  )
  return (
    <svg viewBox="0 0 280 150" className="h-40 w-auto" aria-hidden="true">
      {line(130, 23, 150, 23, 300)}{line(140, 23, 140, 60, 420)}{line(65, 60, 215, 60, 560)}
      {line(65, 60, 65, 74, 700)}{line(140, 60, 140, 74, 700)}{line(215, 60, 215, 74, 700)}{line(140, 100, 140, 114, 1100)}
      {box(70, 10, 0)}{box(150, 10, 80)}
      {box(35, 74, 820)}{box(110, 74, 880)}{box(185, 74, 940)}
      {box(110, 114, 1200, true)}
      <circle cx={152} cy={127} r={9} className="wt-tap fill-brass/40" style={d(1600)} />
    </svg>
  )
}

const ROLES = [/grand(father|mother|parent)$/, /(uncle|aunt)$/, /cousin$/]
const EXAMPLES = ['your grandmother', 'your aunt', 'your cousin']

/** Your card with a brass "You" tag, and how three relatives are related to you. Real ones once you're linked. */
function YouScene({ me, graph }: { me: Person | null; graph: Graph | null }) {
  const relatives = useMemo(() => {
    if (!me || !graph) return EXAMPLES.map((rel) => ({ rel, name: '' }))
    const all = [...graph.people.values()]
    const rels = all.map((p) => ({ p, rel: relationTo(graph, me.id, p) }))
    // For each kind, the closest one: "your grandmother" before "your great-grandmother", "your cousin" before "your second cousin".
    return ROLES.map((re, i) => {
      const best = rels.filter((r) => r.rel && re.test(r.rel)).sort((a, b) => a.rel!.length - b.rel!.length)[0]
      return best ? { rel: best.rel!, name: best.p.nickname || best.p.given_names.split(' ')[0] } : { rel: EXAMPLES[i], name: '' }
    })
  }, [me, graph])
  const tag = (r: { rel: string; name: string }, delay: number) => (
    <span className="wt-in text-center text-[14px] leading-tight" style={d(delay)}>
      {r.name && <span className="block text-ink">{r.name}</span>}
      <span className="italic text-brass">{r.rel}</span>
    </span>
  )
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-3 px-3">
      <span />{tag(relatives[0], 700)}<span />
      {tag(relatives[1], 850)}
      <div className="wt-pop relative flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 shadow-card" style={d(0)}>
        {me ? <Avatar person={me} size={36} /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-moss-light text-moss"><UserRound size={18} /></span>}
        <span className="max-w-[7rem] truncate text-[15px] text-ink">{me ? [me.nickname || me.given_names.split(' ')[0], me.surname].filter(Boolean).join(' ') : 'Your name'}</span>
        <span className="wt-pop absolute -top-2.5 -right-2.5 rounded-full bg-brass px-2 py-0.5 text-[12px] font-medium text-cream" style={d(450)}>You</span>
      </div>
      {tag(relatives[2], 1000)}
    </div>
  )
}

/** The things relatives can add, one after another, then what happens next. */
function AddScene({ last }: { last: string }) {
  const chip = (icon: ReactNode, text: string, delay: number) => (
    <span className="wt-pop flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[15px] text-ink" style={d(delay)}>{icon}{text}</span>
  )
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        {chip(<Camera size={16} className="text-moss" />, 'An old photo', 0)}
        {chip(<CalendarDays size={16} className="text-moss" />, 'A date or a place', 150)}
        {chip(<PenLine size={16} className="text-moss" />, 'A story', 300)}
      </div>
      <span className="wt-in mt-3 flex items-center gap-1.5 text-[15px] text-moss" style={d(800)}><Check size={16} /> {last}</span>
    </div>
  )
}
