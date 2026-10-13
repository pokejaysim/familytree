import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Citation, Event, Family, FamilyChild, Media, Person, Source, Tree, TreeRole } from './types'

async function unwrap<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data as T
}

// Trees ---------------------------------------------------------------------
export const useTrees = () =>
  useQuery({ queryKey: ['trees'], queryFn: () => unwrap<Tree[]>(supabase.from('trees').select('*').order('created_at')) })

export const useTree = (treeId: string) =>
  useQuery({ queryKey: ['tree', treeId], queryFn: () => unwrap<Tree>(supabase.from('trees').select('*').eq('id', treeId).single()) })

export const useMyRole = (treeId: string) =>
  useQuery({
    queryKey: ['role', treeId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser()
      const row = await unwrap<{ role: TreeRole }>(
        supabase.from('tree_members').select('role').eq('tree_id', treeId).eq('user_id', u.user!.id).single(),
      )
      return row.role
    },
  })

export function useCreateTree() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      const { data: u } = await supabase.auth.getUser()
      return unwrap<Tree>(supabase.from('trees').insert({ ...input, owner_id: u.user?.id ?? null }).select().single())
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trees'] }),
  })
}

export function useUpdateTree(treeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<Pick<Tree, 'name' | 'description' | 'intro_title' | 'intro' | 'intro_byline' | 'foreword_title' | 'foreword' | 'foreword_byline'>>) =>
      unwrap<Tree>(supabase.from('trees').update(input).eq('id', treeId).select().single()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tree', treeId] }); qc.invalidateQueries({ queryKey: ['trees'] }) },
  })
}

// Whole-tree snapshot (people + families + children) — small trees load in one go.
export interface TreeData {
  people: Person[]
  families: Family[]
  children: FamilyChild[]
}
export const useTreeData = (treeId: string) =>
  useQuery({
    queryKey: ['treeData', treeId],
    queryFn: async (): Promise<TreeData> => {
      const [people, families] = await Promise.all([
        unwrap<Person[]>(supabase.from('people').select('*').eq('tree_id', treeId).order('surname').order('given_names')),
        unwrap<Family[]>(supabase.from('families').select('*').eq('tree_id', treeId)),
      ])
      const famIds = families.map((f) => f.id)
      const children = famIds.length
        ? await unwrap<FamilyChild[]>(supabase.from('family_children').select('*').in('family_id', famIds).order('sort_order'))
        : []
      return { people, families, children }
    },
  })

// People --------------------------------------------------------------------
export const usePerson = (personId: string) =>
  useQuery({ queryKey: ['person', personId], queryFn: () => unwrap<Person>(supabase.from('people').select('*').eq('id', personId).single()) })

export type PersonInput = Partial<Omit<Person, 'id' | 'tree_id' | 'created_at' | 'updated_at'>>

// Families ------------------------------------------------------------------

// Events --------------------------------------------------------------------
export const usePersonEvents = (personId: string) =>
  useQuery({
    queryKey: ['events', personId],
    queryFn: () => unwrap<Event[]>(supabase.from('events').select('*').eq('person_id', personId).order('date_sort', { nullsFirst: false })),
  })

// Sources & citations -------------------------------------------------------
export const useSources = (treeId: string) =>
  useQuery({ queryKey: ['sources', treeId], queryFn: () => unwrap<Source[]>(supabase.from('sources').select('*').eq('tree_id', treeId).order('title')) })

export const useSource = (sourceId: string) =>
  useQuery({ queryKey: ['source', sourceId], queryFn: () => unwrap<Source>(supabase.from('sources').select('*').eq('id', sourceId).single()) })

export type CitationWithSource = Citation & { source: Source }

export const usePersonCitations = (personId: string) =>
  useQuery({
    queryKey: ['citations', 'person', personId],
    queryFn: () => unwrap<CitationWithSource[]>(supabase.from('citations').select('*, source:sources(*)').eq('person_id', personId).order('created_at')),
  })

export const useSourceCitations = (sourceId: string) =>
  useQuery({
    queryKey: ['citations', 'source', sourceId],
    queryFn: () => unwrap<(Citation & { person: Person | null })[]>(supabase.from('citations').select('*, person:people(*)').eq('source_id', sourceId).order('created_at')),
  })

// Media / storage -----------------------------------------------------------
export const usePersonMedia = (personId: string) =>
  useQuery({ queryKey: ['media', personId], queryFn: () => unwrap<Media[]>(supabase.from('media').select('*').eq('person_id', personId).order('created_at')) })

export const useSourceMedia = (sourceId: string) =>
  useQuery({ queryKey: ['media', 'source', sourceId], queryFn: () => unwrap<Media[]>(supabase.from('media').select('*').eq('source_id', sourceId).order('caption').order('created_at')) })

export async function uploadToTree(treeId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const path = `${treeId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}

export function useSignedUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['signedUrl', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('media').createSignedUrl(path!, 60 * 60)
      if (error) throw new Error(error.message)
      return data.signedUrl
    },
  })
}

// Members -------------------------------------------------------------------
export const useMembers = (treeId: string) =>
  useQuery({
    queryKey: ['members', treeId],
    queryFn: () => unwrap<{ user_id: string; role: TreeRole }[]>(supabase.from('tree_members').select('user_id, role').eq('tree_id', treeId)),
  })
