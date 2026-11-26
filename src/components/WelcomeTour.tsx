import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CalendarDays, Camera, Check, PenLine, Pause, Play, RotateCcw, UserRound } from 'lucide-react'
import Avatar from './Avatar'
import { buildGraph, type Graph } from '../lib/graph'
import { foundersOf, generationsBelow, relationTo, WORDS } from '../lib/kin'
import { TREE } from '../lib/splash'
import type { Person } from '../lib/types'
import type { TreeData } from '../lib/queries'

/**
 * The welcome for new members, played like a short silent video: four scenes flow on by themselves
 * (about 30 seconds), with captions, a progress bar, Pause, Replay and Skip. Built from the real tree,
 * so it shows the family's portraits and, once a member is linked, their own relatives.
 * Plays once per member, on their first sign-in (App.tsx decides when); "Watch the welcome again" on the
 * Contribute page replays it. Speaks as "we", like the rest of the site.
 * Animations live in index.css (.wt-*); people who prefer reduced motion get the scenes without movement.
 */
const SCENE_MS = [7000, 7500, 7500, 8000]
const FADE_MS = 400

export default function WelcomeTour({ data, meId, role, onClose, onStart, onOpenMap }: {
  data: TreeData | undefined
  meId: string | null
  role: 'admin' | 'editor' | 'viewer'
  onClose: () => void
  /** "Get started": close and go to the home page, where the Getting started card is. */
  onStart: () => void
  onOpenMap: (() => void) | null
}) {
  const graph = useMemo(() => (data ? buildGraph(data) : null), [data])
  const founders = useMemo(() => (graph ? foundersOf(graph) : []), [graph])
  const me = (meId && graph?.people.get(meId)) || null

  const gens = graph && founders[0] ? generationsBelow(graph, founders[0]) : 0
  const founderNames = founders.map((f) => f.nickname || f.given_names.split(' ')[0]).join(' and ')
  const scenes: { title: string; text: ReactNode; scene: ReactNode }[] = [
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
      text: <>Look yourself up and tap <b className="font-medium">This is me</b> under your name. Once we’ve confirmed it, the map starts from you and every page says how that person is related to you.</>,
      scene: <YouScene me={null} graph={graph} />,
    },
    role === 'viewer' ? {
      title: 'Know something we’re missing?',
      text: <>Your account can look around for now. If you’d like to add photos, dates or stories, just ask us and we’ll turn that on.</>,
      scene: <AddScene last="Ask us to turn on adding" />,
    } : {
      title: 'Add what you know',
      text: role === 'admin'
        ? <>Know a date, remember a story, or have an old photo? Add it on anyone’s page. Your changes go in straight away, and you can undo any of them from the Admin page.</>
        : <>Know a date, remember a story, or have an old photo? Add it on anyone’s page. We look over every change before it goes in, so don’t worry about getting something wrong.</>,
      scene: <AddScene last={role === 'admin' ? 'Goes in straight away' : 'We look it over'} />,
    },
  ]
  const starts = SCENE_MS.map((_, i) => SCENE_MS.slice(0, i).reduce((a, b) => a + b, 0))
  const total = SCENE_MS.reduce((a, b) => a + b, 0)

  const [t, setT] = useState(0) // milliseconds played
  const [paused, setPaused] = useState(false)
  const done = t >= total
  const step = done ? scenes.length - 1 : Math.max(0, starts.findLastIndex((s) => t >= s))
  const leaving = !done && step < scenes.length - 1 && t > starts[step] + SCENE_MS[step] - FADE_MS
  const playBtn = useRef<HTMLButtonElement>(null)
  const endBtn = useRef<HTMLButtonElement>(null)

  // The clock. A hidden tab doesn't count (frames stop, and a long gap is clamped).
  useEffect(() => {
    if (paused || done) return
    let raf = 0
    let prev = performance.now()
    const tick = (now: number) => {
      // The first frame's time can be a touch earlier than when the clock started: never run backwards.
      const dt = Math.max(0, Math.min(now - prev, 100))
      prev = now
      setT((x) => Math.min(x + dt, total))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused, done, total])

  const jump = (i: number) => { setT(starts[i]); setPaused(false) }
  const replay = () => { setT(0); setPaused(false); playBtn.current?.focus() }
  useEffect(() => { playBtn.current?.focus() }, [])
  useEffect(() => { if (done) endBtn.current?.focus() }, [done])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && step < scenes.length - 1) jump(step + 1)
      else if (e.key === 'ArrowLeft') jump(Math.max(step - (t - starts[step] < 1500 ? 1 : 0), 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const clock = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
  const scene = scenes[step]
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4">
      <div role="dialog" aria-modal="true" aria-label="Welcome to the Sim Family Tree" className="wt-panel w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-sheet">
        {/* The picture. Tapping it pauses, like a video. */}
        <div className={`relative aspect-[16/10] w-full overflow-hidden bg-paper ${paused ? 'wt-paused' : ''}`} onClick={() => !done && setPaused((p) => !p)}>
          <div key={step} aria-hidden="true" className={`wt-drift flex h-full w-full items-center justify-center transition-opacity duration-300 ${leaving ? 'opacity-0' : ''}`} style={{ '--len': `${SCENE_MS[step]}ms` } as CSSProperties}>
            {scene.scene}
          </div>
          {paused && !done && <span className="absolute inset-0 flex items-center justify-center bg-paper/40" aria-hidden="true"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-moss/90 text-cream"><Play size={26} className="ml-1" /></span></span>}
          {done && (
            <div className="wt-in absolute inset-0 flex flex-col items-center justify-center gap-3 bg-paper/85">
              <button ref={endBtn} className="btn-primary min-h-11 px-6 text-[16px]" onClick={(e) => { e.stopPropagation(); onStart() }}>Get started</button>
              <div className="flex flex-wrap justify-center gap-2">
                {onOpenMap && <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); onOpenMap() }}>Open the map</button>}
                <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); replay() }}><RotateCcw size={15} /> Watch again</button>
              </div>
            </div>
          )}
        </div>

        {/* Captions: read out by screen readers as each scene begins. */}
        <div key={`c${step}`} aria-live="polite" className="min-h-[8.5rem] px-6 pt-5">
          <h2 className="wt-in text-[22px] leading-tight text-ink" style={d(150)}>{scene.title}</h2>
          <p className="wt-in mt-2 text-[16px] leading-relaxed text-ink-soft" style={d(300)}>{scene.text}</p>
          {done && <p className="mt-3 text-[14px] text-ink-mute">You can watch this again any time from How to contribute.</p>}
        </div>

        <div className="mt-4 flex items-center gap-3 border-t border-line px-4 py-3">
          <button ref={playBtn} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-moss hover:bg-moss-light"
            aria-label={done ? 'Watch again' : paused ? 'Play' : 'Pause'} onClick={() => (done ? replay() : setPaused((p) => !p))}>
            {done ? <RotateCcw size={19} /> : paused ? <Play size={19} /> : <Pause size={19} />}
          </button>
          <div className="flex flex-1 gap-1.5">
            {scenes.map((s, i) => {
              const fill = Math.max(0, Math.min(1, (t - starts[i]) / SCENE_MS[i]))
              return (
                <button key={i} className="group flex h-10 flex-1 items-center" aria-label={`Scene ${i + 1}: ${s.title}`} aria-current={i === step ? 'step' : undefined} onClick={() => jump(i)}>
                  <span className="h-1.5 w-full overflow-hidden rounded-full bg-line group-hover:bg-field">
                    <span className="block h-full rounded-full bg-moss" style={{ width: `${fill * 100}%` }} />
                  </span>
                </button>
              )
            })}
          </div>
          <span className="w-[4.5rem] shrink-0 text-right text-[13px] tabular-nums text-ink-mute" aria-hidden="true">{clock(t)} / {clock(total)}</span>
          <button className="shrink-0 text-[15px] text-ink-mute underline underline-offset-4 hover:text-moss" onClick={onClose}>{done ? 'Close' : 'Skip'}</button>
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
