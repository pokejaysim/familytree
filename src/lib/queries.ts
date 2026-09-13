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

function useTreeMutation<TInput>(treeId: string, fn: (input: TInput) => Promise<unknown>, extraKeys: string[][] = []) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treeData', treeId] })
      extraKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }))
    },
  })
}

// People --------------------------------------------------------------------
export const usePerson = (personId: string) =>
  useQuery({ queryKey: ['person', personId], queryFn: () => unwrap<Person>(supabase.from('people').select('*').eq('id', personId).single()) })

export type PersonInput = Partial<Omit<Person, 'id' | 'tree_id' | 'created_at' | 'updated_at'>>

export const useCreatePerson = (treeId: string) =>
  useTreeMutation(treeId, (input: PersonInput) =>
    unwrap<Person>(supabase.from('people').insert({ ...input, tree_id: treeId }).select().single()),
  )

export const useUpdatePerson = (treeId: string, personId: string) =>
  useTreeMutation(treeId, (input: PersonInput) => unwrap<Person>(supabase.from('people').update(input).eq('id', personId).select().single()), [
    ['person', personId],
  ])

export const useDeletePerson = (treeId: string) =>
  useTreeMutation(treeId, (personId: string) => unwrap(supabase.from('people').delete().eq('id', personId)))

// Families ------------------------------------------------------------------
export type FamilyInput = Partial<Omit<Family, 'id' | 'tree_id'>>

export const useCreateFamily = (treeId: string) =>
  useTreeMutation(treeId, (input: FamilyInput) =>
    unwrap<Family>(supabase.from('families').insert({ ...input, tree_id: treeId }).select().single()),
  )

export const useUpdateFamily = (treeId: string) =>
  useTreeMutation(treeId, ({ id, ...input }: FamilyInput & { id: string }) =>
    unwrap<Family>(supabase.from('families').update(input).eq('id', id).select().single()),
  )

export const useDeleteFamily = (treeId: string) =>
  useTreeMutation(treeId, (id: string) => unwrap(supabase.from('families').delete().eq('id', id)))

export const useAddChild = (treeId: string) =>
  useTreeMutation(treeId, (input: { family_id: string; person_id: string; relation?: FamilyChild['relation'] }) =>
    unwrap(supabase.from('family_children').insert(input)),
  )

export const useRemoveChild = (treeId: string) =>
  useTreeMutation(treeId, (input: { family_id: string; person_id: string }) =>
    unwrap(supabase.from('family_children').delete().eq('family_id', input.family_id).eq('person_id', input.person_id)),
  )

// Events --------------------------------------------------------------------
export const usePersonEvents = (personId: string) =>
  useQuery({
    queryKey: ['events', personId],
    queryFn: () => unwrap<Event[]>(supabase.from('events').select('*').eq('person_id', personId).order('date_sort', { nullsFirst: false })),
  })

export function useEventMutations(treeId: string, personId: string) {
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ['events', personId] })
  const create = useMutation({
    mutationFn: (input: Partial<Event>) => unwrap<Event>(supabase.from('events').insert({ ...input, tree_id: treeId, person_id: personId }).select().single()),
    onSuccess: inv,
  })
  const remove = useMutation({ mutationFn: (id: string) => unwrap(supabase.from('events').delete().eq('id', id)), onSuccess: inv })
  return { create, remove }
}

// Sources & citations -------------------------------------------------------
export const useSources = (treeId: string) =>
  useQuery({ queryKey: ['sources', treeId], queryFn: () => unwrap<Source[]>(supabase.from('sources').select('*').eq('tree_id', treeId).order('title')) })

export const useSource = (sourceId: string) =>
  useQuery({ queryKey: ['source', sourceId], queryFn: () => unwrap<Source>(supabase.from('sources').select('*').eq('id', sourceId).single()) })

export function useSourceMutations(treeId: string) {
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ['sources', treeId] })
  const create = useMutation({
    mutationFn: (input: Partial<Source>) => unwrap<Source>(supabase.from('sources').insert({ ...input, tree_id: treeId }).select().single()),
    onSuccess: inv,
  })
  const update = useMutation({
    mutationFn: ({ id, ...input }: Partial<Source> & { id: string }) => unwrap<Source>(supabase.from('sources').update(input).eq('id', id).select().single()),
    onSuccess: (s) => { inv(); qc.invalidateQueries({ queryKey: ['source', s.id] }) },
  })
  const remove = useMutation({ mutationFn: (id: string) => unwrap(supabase.from('sources').delete().eq('id', id)), onSuccess: inv })
  return { create, update, remove }
}

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

export function useCitationMutations(treeId: string, personId: string) {
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ['citations'] })
  const create = useMutation({
    mutationFn: (input: Partial<Citation>) => unwrap<Citation>(supabase.from('citations').insert({ ...input, tree_id: treeId, person_id: personId }).select().single()),
    onSuccess: inv,
  })
  const remove = useMutation({ mutationFn: (id: string) => unwrap(supabase.from('citations').delete().eq('id', id)), onSuccess: inv })
  return { create, remove }
}

// Media / storage -----------------------------------------------------------
export const usePersonMedia = (personId: string) =>
  useQuery({ queryKey: ['media', personId], queryFn: () => unwrap<Media[]>(supabase.from('media').select('*').eq('person_id', personId).order('created_at')) })

export const useSourceMedia = (sourceId: string) =>
  useQuery({ queryKey: ['media', 'source', sourceId], queryFn: () => unwrap<Media[]>(supabase.from('media').select('*').eq('source_id', sourceId).order('caption').order('created_at')) })

export function useSourceMediaMutations(treeId: string, sourceId: string) {
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ['media', 'source', sourceId] })
  const upload = useMutation({
    mutationFn: async ({ file, caption }: { file: File; caption?: string }) => {
      const storage_path = await uploadToTree(treeId, file)
      return unwrap<Media>(supabase.from('media').insert({ tree_id: treeId, source_id: sourceId, storage_path, mime_type: file.type, caption: caption ?? file.name.replace(/\.[^.]+$/, '') }).select().single())
    },
    onSuccess: inv,
  })
  const remove = useMutation({
    mutationFn: async (m: Media) => { await supabase.storage.from('media').remove([m.storage_path]); return unwrap(supabase.from('media').delete().eq('id', m.id)) },
    onSuccess: inv,
  })
  return { upload, remove }
}

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

export function useMediaMutations(treeId: string, personId: string) {
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: ['media', personId] })
  const upload = useMutation({
    mutationFn: async ({ file, caption }: { file: File; caption?: string }) => {
      const storage_path = await uploadToTree(treeId, file)
      return unwrap<Media>(supabase.from('media').insert({ tree_id: treeId, person_id: personId, storage_path, mime_type: file.type, caption }).select().single())
    },
    onSuccess: inv,
  })
  const remove = useMutation({
    mutationFn: async (m: Media) => {
      await supabase.storage.from('media').remove([m.storage_path])
      return unwrap(supabase.from('media').delete().eq('id', m.id))
    },
    onSuccess: inv,
  })
  return { upload, remove }
}

// Members -------------------------------------------------------------------
export const useMembers = (treeId: string) =>
  useQuery({
    queryKey: ['members', treeId],
    queryFn: () => unwrap<{ user_id: string; role: TreeRole }[]>(supabase.from('tree_members').select('user_id, role').eq('tree_id', treeId)),
  })
