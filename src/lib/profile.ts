import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RecordModel } from 'pocketbase'
import { call, pb } from './pb'
import { useAuth } from './auth'

export type MemberStatus = 'pending' | 'approved' | 'declined'
export type MemberRole = 'admin' | 'editor' | 'viewer'
export interface Profile {
  id: string
  email: string
  name: string | null
  status: MemberStatus
  role: MemberRole
  created_at: string
  reviewed_at: string | null
  person_id: string | null
  person_status: 'pending' | 'approved' | null
  /** They confirmed their email at some point (an older sign-up, or a password reset). Not needed to sign in. */
  verified: boolean
  /** Their last visit, recorded since the Admin page arrived (null before then). */
  last_seen: string | null
  /** When they first watched (or skipped) the welcome video; null until then. */
  welcomed_at: string | null
}

/** A PocketBase user account as the app's member profile (Supabase kept these in a separate "profiles" table). */
const toProfile = (r: RecordModel): Profile => ({
  id: r.id,
  email: String(r.email ?? ''),
  name: r.name || null,
  status: (r.status || 'pending') as MemberStatus,
  role: (r.role || 'viewer') as MemberRole,
  created_at: String(r.created ?? '').replace(' ', 'T'),
  reviewed_at: r.reviewed_at ? String(r.reviewed_at).replace(' ', 'T') : null,
  person_id: r.person || null,
  person_status: r.person_status || null,
  verified: !!r.verified,
  last_seen: r.last_seen ? String(r.last_seen).replace(' ', 'T') : null,
  welcomed_at: r.welcomed_at ? String(r.welcomed_at).replace(' ', 'T') : null,
})

/** The signed-in user's own membership record. */
export function useProfile() {
  const { session } = useAuth()
  const uid = session?.user.id
  return useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async () => toProfile(await call(pb.collection('users').getOne(uid!))),
  })
}

export const useIsAdmin = () => useProfile().data?.role === 'admin'
/** What saving does for this account: admins' changes apply at once, editors' wait for review. */
export const useSaveLabel = () => (useIsAdmin() ? 'Save' : 'Send for review')
/** Editors and admins may change data; viewers only look. */
export const useCanEdit = () => { const r = useProfile().data?.role; return r === 'admin' || r === 'editor' }

export const usePendingCount = (enabled: boolean) =>
  useQuery({
    queryKey: ['pendingCount'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => (await call(pb.send<{ members: number }>('/api/sft/counts', {}))).members ?? 0,
  })

export const useMembers = () =>
  useQuery({
    queryKey: ['members'],
    queryFn: async () => (await call(pb.collection('users').getFullList({ sort: 'status,-created' }))).map(toProfile),
  })

export function useReviewMember() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async ({ id, status, role }: { id: string; status: MemberStatus; role?: MemberRole }) => {
      const patch: Record<string, unknown> = { status, reviewed_at: new Date().toISOString(), reviewed_by: session?.user.id ?? '' }
      if (role) patch.role = role
      await call(pb.collection('users').update(id, patch))
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['pendingCount'] }) },
  })
}

/** The admin links a member to their person in the tree (person null clears it). */
export function useLinkMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ user, person }: { user: string; person: string | null }) => {
      await call(pb.send('/api/sft/link-member', { method: 'POST', body: { user, person } }))
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['profile'] }) },
  })
}

/** Send a member a password reset link, the same email they could ask for themselves. */
export const sendResetLink = (email: string) => call(pb.collection('users').requestPasswordReset(email))

/** Record that the signed-in member has seen the welcome video, so it doesn't play again on any device. */
export const markWelcomed = () => call(pb.send('/api/sft/welcomed', { method: 'POST' }))

/** The visitor's own person in the tree, once an admin has confirmed "This is me"; otherwise null. */
export function useMeId(): string | null {
  const { data: profile } = useProfile()
  return profile?.person_status === 'approved' ? profile.person_id : null
}
