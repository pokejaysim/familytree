import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { call, fileRef, pb, pbFilter, toApp } from './pb'
import { useAuth } from './auth'
import type { Citation, Event, Family, FamilyChild, Media, Person, Source, Tree, TreeRole } from './types'

type Row = Record<string, unknown>
const all = async <T>(table: string, options: Record<string, unknown>) =>
  (await call(pb.collection(table).getFullList(options))).map((r) => toApp<T>(table, r as Row))
const one = async <T>(table: string, id: string, options: Record<string, unknown> = {}) =>
  toApp<T>(table, (await call(pb.collection(table).getOne(id, options))) as Row)

// Trees ---------------------------------------------------------------------
export const useTrees = () =>
  useQuery({ queryKey: ['trees'], queryFn: () => all<Tree>('trees', { sort: 'created_at' }) })

export const useTree = (treeId: string) =>
  useQuery({ queryKey: ['tree', treeId], queryFn: () => one<Tree>('trees', treeId) })

export const useMyRole = (treeId: string) => {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['role', treeId],
    queryFn: async () => {
      const row = await call(pb.collection('tree_members').getFirstListItem(pbFilter('tree = {:t} && user = {:u}', { t: treeId, u: session?.user.id ?? '' })))
      return row.role as TreeRole
    },
  })
}

export function useCreateTree() {
  const qc = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) =>
      toApp<Tree>('trees', (await call(pb.collection('trees').create({ ...input, owner: session?.user.id ?? '' }))) as Row),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trees'] }),
  })
}

export function useUpdateTree(treeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<Pick<Tree, 'name' | 'description' | 'intro_title' | 'intro' | 'intro_byline' | 'foreword_title' | 'foreword' | 'foreword_byline'>>) =>
      toApp<Tree>('trees', (await call(pb.collection('trees').update(treeId, input))) as Row),
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
      const inTree = pbFilter('tree = {:t}', { t: treeId })
      const [people, families, children] = await Promise.all([
        all<Person>('people', { filter: inTree, sort: 'surname,given_names', expand: 'photo' }),
        all<Family>('families', { filter: inTree }),
        all<FamilyChild>('family_children', { filter: pbFilter('family.tree = {:t}', { t: treeId }), sort: 'sort_order' }),
      ])
      return { people, families, children }
    },
  })

// People --------------------------------------------------------------------
export const usePerson = (personId: string) =>
  useQuery({ queryKey: ['person', personId], queryFn: () => one<Person>('people', personId, { expand: 'photo' }) })

export type PersonInput = Partial<Omit<Person, 'id' | 'tree_id' | 'created_at' | 'updated_at'>>

// Events --------------------------------------------------------------------
export const usePersonEvents = (personId: string) =>
  useQuery({
    queryKey: ['events', personId],
    queryFn: async () => {
      const events = await all<Event>('events', { filter: pbFilter('person = {:p}', { p: personId }) })
      // By date, undated ones last (as Supabase's "nulls last" did).
      return events.sort((a, b) => (a.date_sort ? (b.date_sort ? a.date_sort.localeCompare(b.date_sort) : -1) : b.date_sort ? 1 : 0))
    },
  })

// Sources & citations -------------------------------------------------------
export const useSources = (treeId: string) =>
  useQuery({ queryKey: ['sources', treeId], queryFn: () => all<Source>('sources', { filter: pbFilter('tree = {:t}', { t: treeId }), sort: 'title' }) })

export const useSource = (sourceId: string) =>
  useQuery({ queryKey: ['source', sourceId], queryFn: () => one<Source>('sources', sourceId) })

export type CitationWithSource = Citation & { source: Source }

export const usePersonCitations = (personId: string) =>
  useQuery({
    queryKey: ['citations', 'person', personId],
    queryFn: async () => {
      const rows = await call(pb.collection('citations').getFullList({ filter: pbFilter('person = {:p}', { p: personId }), sort: 'created_at', expand: 'source' }))
      return rows.map((r) => ({ ...toApp<Citation>('citations', r as Row), source: toApp<Source>('sources', (r.expand?.source ?? {}) as Row) }))
    },
  })

export const useSourceCitations = (sourceId: string) =>
  useQuery({
    queryKey: ['citations', 'source', sourceId],
    queryFn: async () => {
      const rows = await call(pb.collection('citations').getFullList({ filter: pbFilter('source = {:s}', { s: sourceId }), sort: 'created_at', expand: 'person.photo' }))
      return rows.map((r) => ({ ...toApp<Citation>('citations', r as Row), person: r.expand?.person ? toApp<Person>('people', r.expand.person as Row) : null }))
    },
  })

// Media / files -------------------------------------------------------------
export const usePersonMedia = (personId: string) =>
  useQuery({ queryKey: ['media', personId], queryFn: () => all<Media>('media', { filter: pbFilter('person = {:p}', { p: personId }), sort: 'created_at' }) })

export const useSourceMedia = (sourceId: string) =>
  useQuery({ queryKey: ['media', 'source', sourceId], queryFn: () => all<Media>('media', { filter: pbFilter('source = {:s}', { s: sourceId }), sort: 'caption,created_at' }) })

/**
 * Put a file in the waiting area and return its reference. A media "insert" change with that
 * reference as `storage_path` turns it into a photo in the tree (straight away for an admin,
 * after review for everyone else).
 */
export async function uploadToTree(treeId: string, file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('tree', treeId)
  const r = await call(pb.collection('uploads').create(form))
  return fileRef('uploads', r.id, r.file)!
}

/** One file token (valid an hour) covers every photo, so photos don't each need signing. */
const useFileToken = () => {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['fileToken', session?.user.id],
    enabled: !!session,
    staleTime: 50 * 60 * 1000,
    refetchInterval: 50 * 60 * 1000,
    queryFn: () => call(pb.files.getToken()),
  })
}

/** Thumbnail sizes PocketBase makes (see the media field in pocketbase/pb_migrations). */
export type Thumb = '160x160' | '480x0' | '1200x0'

/** A viewable URL for a file reference ("media/<id>/<file>" or "uploads/<id>/<file>"), optionally a smaller copy. */
export function useSignedUrl(ref: string | null | undefined, thumb?: Thumb) {
  const { data: token } = useFileToken()
  if (!ref || !token) return { data: undefined }
  const path = ref.split('/').map(encodeURIComponent).join('/')
  return { data: `${pb.baseURL}/api/files/${path}?token=${encodeURIComponent(token)}${thumb ? `&thumb=${thumb}` : ''}` }
}

// Members -------------------------------------------------------------------
export const useMembers = (treeId: string) =>
  useQuery({
    queryKey: ['members', treeId],
    queryFn: async () => (await call(pb.collection('tree_members').getFullList({ filter: pbFilter('tree = {:t}', { t: treeId }) }))).map((r) => ({ user_id: r.user as string, role: r.role as TreeRole })),
  })
