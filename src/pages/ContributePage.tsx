import { Link } from 'react-router-dom'
import { BadgeCheck, Camera, Clock3, Search, UserRound } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../lib/auth'
import { useCanEdit, useIsAdmin, useProfile } from '../lib/profile'
import { useMyRequests, useWithdrawRequest } from '../lib/changes'
import { useTrees } from '../lib/queries'
import { ADMIN_NAME } from '../config'
import divider from '../assets/branch-divider.svg'

/** How to contribute: a short guide, plus the signed-in person's own suggestions and where they stand. */
export default function ContributePage() {
  const canEdit = useCanEdit()
  const isAdmin = useIsAdmin()
  const { session } = useAuth()
  const { data: profile } = useProfile()
  const { data: trees = [] } = useTrees()
  const tree = trees[0]
  const base = tree ? `/trees/${tree.id}` : '/'
  const myProfile = profile?.person_id && profile.person_status === 'approved' && tree ? `${base}/people/${profile.person_id}` : null

  const steps: { icon: React.ReactNode; title: string; text: React.ReactNode }[] = [
    { icon: <UserRound size={18} />, title: 'Start with yourself', text: myProfile
        ? <>Your account is linked to <Link className="text-brass underline underline-offset-2" to={myProfile}>your profile</Link>. Check your own details first: they're the ones you know best.</>
        : <>Find your own profile and press <b className="font-medium">This is me</b> under your name. {ADMIN_NAME} confirms it, and your profile is then one tap away.</> },
    { icon: <Search size={18} />, title: 'Find the person', text: <>Use <b className="font-medium">Find a relative</b> on the <Link className="text-brass underline underline-offset-2" to={`${base}/chart`}>map</Link>, or the <Link className="text-brass underline underline-offset-2" to={`${base}/people`}>People</Link> list. Tap their card, then <b className="font-medium">Open profile</b>.</> },
    { icon: <Camera size={18} />, title: 'Add what you know', text: <>Each profile shows what's missing. Press <b className="font-medium">Suggest an edit</b> to fix a name, a date or a place, or to write a few lines about them. Use the camera on their picture for a portrait, <b className="font-medium">Upload</b> for more photos and documents, and the <b className="font-medium">+</b> beside Parents, Siblings or Children to add a relative who's missing.</> },
    { icon: <Clock3 size={18} />, title: `${ADMIN_NAME} checks it`, text: <>Every change is checked by {ADMIN_NAME} before it appears in the tree, so you can't break anything. While it waits, it's listed on the profile and below. If something isn't right, you can withdraw it.</> },
  ]

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="min-h-0 flex-1 overflow-auto">
        <article className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
          <p className="text-center text-[12px] uppercase tracking-[.12em] text-brass">Contribute</p>
          <h1 className="mt-2 text-center text-3xl leading-tight sm:text-4xl">This tree is everyone's to grow.</h1>
          <img src={divider} alt="" width={200} height={20} className="mx-auto mt-4 opacity-90" />
          <p className="mt-6 text-center text-[17px] leading-relaxed text-ink-soft">
            If you know a name, a date or a story, or have a photo the rest of the family has never seen, you can add it.
            Nothing is too small. An approximate year is better than a blank.
          </p>

          {!canEdit && (
            <p className="mt-8 rounded-md border border-brass-light/60 bg-[#FBF5E6] p-4 text-[15px] text-ink-soft">
              Your account can view the tree but can't suggest changes yet. Ask {ADMIN_NAME} to let you contribute.
            </p>
          )}

          <ol className="mt-10 space-y-6">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-moss-light text-moss">{s.icon}</span>
                <div>
                  <p className="text-[18px] text-ink"><span className="text-ink-mute">{i + 1}.</span> {s.title}</p>
                  <p className="mt-1 text-[16px] leading-relaxed text-ink-soft">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <section className="mt-10 rounded-md border border-line bg-white p-5">
            <h2 className="text-[12px] uppercase tracking-[.12em] text-brass">Good to know</h2>
            <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-ink-soft">
              <li>· Dates can be rough: “1954”, “Jun 1954” or “abt 1954” all work.</li>
              <li>· Say where a fact came from with <b className="font-medium">Cite a source</b>: the family book, a certificate, a letter, or what a relative told you.</li>
              <li>· A phone photo of an old print is fine. If you still have the original, a scan is even better.</li>
              <li>· Living relatives' details are only visible to approved family members.</li>
            </ul>
          </section>

          {session && !isAdmin && <MySuggestions userId={session.user.id} />}

          <p className="mt-10 text-center">
            <Link to={`${base}/chart`} className="btn-primary min-h-[44px] px-6">Open the map</Link>
          </p>
        </article>
      </main>
    </div>
  )
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Waiting for review', cls: 'bg-[#FBF5E6] text-[#7A5A12]' },
  approved: { label: 'Added', cls: 'bg-moss-light text-moss' },
  rejected: { label: 'Not added', cls: 'bg-[#F1DCD0] text-[#7A4A32]' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-paper text-ink-mute' },
  reverted: { label: 'Undone', cls: 'bg-paper text-ink-mute' },
}

function MySuggestions({ userId }: { userId: string }) {
  const { data: mine = [] } = useMyRequests(userId)
  const withdraw = useWithdrawRequest()
  if (mine.length === 0) return null
  return (
    <section className="mt-10">
      <h2 className="text-xl">Your suggestions</h2>
      <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-white">
        {mine.map((r) => {
          const s = STATUS[r.status]
          return (
            <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] text-ink">{r.summary}</p>
                <p className="text-[13px] text-ink-mute">{new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}{r.review_note && <> · {ADMIN_NAME}: “{r.review_note}”</>}</p>
              </div>
              <span className={`inline-flex items-center gap-1 self-start rounded-full px-2.5 py-0.5 text-[12px] sm:self-center ${s.cls}`}>{r.status === 'approved' && <BadgeCheck size={12} />}{s.label}</span>
              {r.status === 'pending' && <button className="self-start text-[13px] text-brass underline underline-offset-2 hover:text-moss sm:self-center" onClick={() => withdraw.mutate(r.id)}>Withdraw</button>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
