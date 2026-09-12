import { Check, X } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { useIsAdmin, useMembers, useReviewMember, type MemberRole, type Profile } from '../lib/profile'
import { useAuth } from '../lib/auth'

const ROLE_HELP: Record<MemberRole, string> = { viewer: 'Can browse everything', editor: 'Can add and change people, photos, sources', admin: 'Editor plus approving members' }

export default function MembersPage() {
  const isAdmin = useIsAdmin()
  const { session } = useAuth()
  const { data: members, isLoading, error } = useMembers()
  const review = useReviewMember()
  if (!isAdmin) return <div className="flex h-full flex-col"><AppHeader /><p className="p-6 text-ink-mute">Only admins can manage members.</p></div>

  const pending = members?.filter((m) => m.status === 'pending') ?? []
  const approved = members?.filter((m) => m.status === 'approved') ?? []
  const declined = members?.filter((m) => m.status === 'declined') ?? []
  const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

  const Row = ({ m }: { m: Profile }) => {
    const me = m.id === session?.user.id
    return (
      <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><span className="truncate text-[17px]">{m.name || m.email}</span>{me && <span className="text-xs text-ink-mute">(you)</span>}</div>
          <div className="truncate text-sm text-ink-mute">{m.email} · signed up {when(m.created_at)}</div>
          {m.note && <div className="mt-1 text-sm italic text-ink-soft">“{m.note}”</div>}
        </div>
        {m.status === 'pending' ? (
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={review.isPending} onClick={() => review.mutate({ id: m.id, status: 'approved', role: 'viewer' })}><Check size={14} /> Approve as viewer</button>
            <button className="btn-ghost" disabled={review.isPending} onClick={() => review.mutate({ id: m.id, status: 'approved', role: 'editor' })}>Approve as editor</button>
            <button className="btn-danger" disabled={review.isPending} onClick={() => review.mutate({ id: m.id, status: 'declined' })}><X size={14} /> Decline</button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <select className="input w-auto" value={m.role} disabled={me || review.isPending} title={ROLE_HELP[m.role]} onChange={(e) => review.mutate({ id: m.id, status: m.status, role: e.target.value as MemberRole })}>
              <option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option>
            </select>
            {!me && (m.status === 'approved'
              ? <button className="btn-danger" disabled={review.isPending} onClick={() => { if (confirm(`Remove ${m.name || m.email}'s access?`)) review.mutate({ id: m.id, status: 'declined' }) }}>Remove access</button>
              : <button className="btn-ghost" disabled={review.isPending} onClick={() => review.mutate({ id: m.id, status: 'approved', role: 'viewer' })}>Re-approve</button>)}
          </div>
        )}
      </li>
    )
  }

  const Section = ({ title, items, empty }: { title: string; items: Profile[]; empty: string }) => (
    <section className="card">
      <h2 className="mb-1 text-xl">{title} <span className="text-ink-mute">{items.length}</span></h2>
      {items.length === 0 ? <p className="text-sm text-ink-mute">{empty}</p> : <ul className="divide-y divide-line">{items.map((m) => <Row key={m.id} m={m} />)}</ul>}
    </section>
  )

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
          <div>
            <h1 className="text-2xl">Members</h1>
            <p className="text-sm text-ink-mute">New accounts wait here until you approve them. Viewers can browse; editors can also add and change things.</p>
          </div>
          {isLoading && <p className="text-ink-mute">Loading…</p>}
          {error && <p className="text-red-800">{error.message}</p>}
          {review.error && <p className="text-red-800">{review.error.message}</p>}
          <Section title="Waiting for approval" items={pending} empty="Nobody is waiting." />
          <Section title="Approved" items={approved} empty="No approved members yet." />
          {declined.length > 0 && <Section title="Declined" items={declined} empty="" />}
        </div>
      </main>
    </div>
  )
}
