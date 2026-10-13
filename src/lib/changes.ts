import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { toast } from './toast'
import { ADMIN_NAME } from '../config'

/**
 * Every change to the family data goes through `submit_changes` (see the reviewed_contributions migration).
 * One user action = one change request holding an ordered list of row changes. Admins' requests apply at once;
 * everyone else's wait in the review queue until an admin approves them. New rows get their ids here, so later
 * changes in the same request (a family, a child link) can refer to a person the request is creating.
 */
export type Table = 'people' | 'families' | 'family_children' | 'events' | 'citations' | 'sources' | 'media'
export interface Change { table: Table; op: 'insert' | 'update' | 'delete'; key?: Record<string, unknown>; data?: Record<string, unknown>; before?: Record<string, unknown> | null }
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'reverted'
export interface Submitted { id: string; status: 'approved' | 'pending' }
export interface ChangeRequest {
  id: string
  tree_id: string
  author_id: string
  summary: string
  subject_person_id: string | null
  changes: Change[]
  status: RequestStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export const newId = () => crypto.randomUUID()

/** Refresh everything that might show changed data (signed photo URLs are left alone so images don't flicker). */
export const refreshAll = (qc: QueryClient) => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'signedUrl' && q.queryKey[0] !== 'profile' })

export async function submitChanges(treeId: string, summary: string, subject: string | null, changes: Change[]): Promise<Submitted> {
  const { data, error } = await supabase.rpc('submit_changes', { p_tree: treeId, p_summary: summary, p_subject: subject, p_changes: changes })
  if (error) throw new Error(error.message)
  return data as Submitted
}

/** Submit a change and tell the person what happened: saved (admins) or sent for review (everyone else). */
export function useSubmit(treeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ summary, subject = null, changes }: { summary: string; subject?: string | null; changes: Change[] }) => submitChanges(treeId, summary, subject, changes),
    onSuccess: (r) => {
      refreshAll(qc)
      if (r.status === 'pending') toast('review', `Sent to ${ADMIN_NAME} for review`, `It will appear in the tree once ${ADMIN_NAME} approves it. You can follow it on the Contribute page.`)
      else toast('saved', 'Saved')
    },
    onError: (e: Error) => toast('error', 'That change could not be sent', e.message),
  })
}

// Reading requests -------------------------------------------------------------------------------------------------------
export const useMyRequests = (userId: string | undefined) =>
  useQuery({
    queryKey: ['requests', 'mine', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('change_requests').select('*').eq('author_id', userId!).order('created_at', { ascending: false }).limit(100)
      if (error) throw new Error(error.message)
      return data as ChangeRequest[]
    },
  })

/** Requests about one person that are still waiting (an editor sees their own; an admin sees everyone's). */
export const usePendingFor = (personId: string) =>
  useQuery({
    queryKey: ['requests', 'person', personId],
    queryFn: async () => {
      const { data, error } = await supabase.from('change_requests').select('*').eq('subject_person_id', personId).eq('status', 'pending').order('created_at')
      if (error) throw new Error(error.message)
      return data as ChangeRequest[]
    },
  })

export const useReviewQueue = (enabled: boolean) =>
  useQuery({
    queryKey: ['requests', 'queue'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('change_requests').select('*').eq('status', 'pending').order('created_at')
      if (error) throw new Error(error.message)
      return data as ChangeRequest[]
    },
  })

export const useRecentHistory = (enabled: boolean) =>
  useQuery({
    queryKey: ['requests', 'history'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('change_requests').select('*').neq('status', 'pending').order('reviewed_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(60)
      if (error) throw new Error(error.message)
      return data as ChangeRequest[]
    },
  })

export const usePendingReviewCount = (enabled: boolean) =>
  useQuery({
    queryKey: ['reviewCount'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => { const { data, error } = await supabase.rpc('pending_review_count'); if (error) throw new Error(error.message); return (data as number) ?? 0 },
  })

// Acting on requests -----------------------------------------------------------------------------------------------------
function useRpc<T>(fn: string, toArgs: (v: T) => Record<string, unknown>, done?: (v: T) => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: T) => { const { error } = await supabase.rpc(fn, toArgs(v)); if (error) throw new Error(error.message) },
    onSuccess: (_r, v) => { refreshAll(qc); done?.(v) },
    onError: (e: Error) => toast('error', 'That did not work', e.message),
  })
}

export const useReviewRequest = () =>
  useRpc<{ id: string; approve: boolean; note?: string }>('review_request', (v) => ({ p_id: v.id, p_approve: v.approve, p_note: v.note ?? null }),
    (v) => toast('saved', v.approve ? 'Approved and added to the tree' : 'Declined'))
export const useWithdrawRequest = () => useRpc<string>('withdraw_request', (id) => ({ p_id: id }), () => toast('saved', 'Suggestion withdrawn'))
export const useRevertRequest = () => useRpc<string>('revert_request', (id) => ({ p_id: id }), () => toast('saved', 'Change undone'))
/** "This is me". Admins' links apply at once; everyone else's wait for an admin to confirm. */
export function useClaimPerson() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string | null) => { const { error } = await supabase.rpc('claim_person', { p_person: id }); if (error) throw new Error(error.message) },
    onSuccess: async (_r, id) => {
      await qc.invalidateQueries({ queryKey: ['profile'] })
      refreshAll(qc)
      const { data } = await supabase.from('profiles').select('person_status').eq('id', (await supabase.auth.getUser()).data.user?.id ?? '').maybeSingle()
      if (!id) toast('saved', 'Link removed')
      else if (data?.person_status === 'approved') toast('saved', 'Linked to your account', 'Tap your initials at the top to come back to your profile.')
      else toast('review', 'Profile link requested', `${ADMIN_NAME} will confirm it's you.`)
    },
    onError: (e: Error) => toast('error', 'That did not work', e.message),
  })
}
export const useReviewClaim = () => useRpc<{ profile: string; approve: boolean }>('review_claim', (v) => ({ p_profile: v.profile, p_approve: v.approve }), (v) => toast('saved', v.approve ? 'Profile link confirmed' : 'Profile link declined'))
