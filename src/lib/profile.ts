import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { useAuth } from './auth'

export type MemberStatus = 'pending' | 'approved' | 'declined'
export type MemberRole = 'admin' | 'editor' | 'viewer'
export interface Profile {
  id: string
  email: string
  name: string | null
  status: MemberStatus
  role: MemberRole
  note: string | null
  created_at: string
  reviewed_at: string | null
}

/** The signed-in user's own membership record. */
export function useProfile() {
  const { session } = useAuth()
  const uid = session?.user.id
  return useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid!).maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Profile | null) ?? null
    },
  })
}

export const useIsAdmin = () => useProfile().data?.role === 'admin'
/** Editors and admins may change data; viewers only look. */
export const useCanEdit = () => { const r = useProfile().data?.role; return r === 'admin' || r === 'editor' }

export const usePendingCount = (enabled: boolean) =>
  useQuery({
    queryKey: ['pendingCount'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => { const { data, error } = await supabase.rpc('pending_member_count'); if (error) throw new Error(error.message); return (data as number) ?? 0 },
  })

export const useMembers = () =>
  useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('status').order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data as Profile[]
    },
  })

export function useReviewMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, role }: { id: string; status: MemberStatus; role?: MemberRole }) => {
      const { data: u } = await supabase.auth.getUser()
      const patch: Partial<Profile> & { reviewed_by?: string | null } = { status, reviewed_at: new Date().toISOString(), reviewed_by: u.user?.id ?? null }
      if (role) patch.role = role
      const { error } = await supabase.from('profiles').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['pendingCount'] }) },
  })
}
