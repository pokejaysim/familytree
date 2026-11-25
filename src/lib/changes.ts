import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { RecordModel } from 'pocketbase'
import { call, fileRef, isMediaRef, isUploadRef, pb, pbFilter, refId, toApp, toPbFields, type MediaRefs } from './pb'
import { toast } from './toast'
import { ADMIN_NAME } from '../config'

/**
 * Every change to the family data goes through the review endpoints (pocketbase/pb_hooks/review.pb.js).
 * One user action = one change request holding an ordered list of row changes. Admins' requests apply at once;
 * everyone else's wait in the review queue until an admin approves them. New rows get their ids here, so later
 * changes in the same request (a family, a child link) can refer to a person the request is creating.
 *
 * The app describes changes with the Supabase-era names (person_id, storage_path, photo_path); this file
 * translates them to PocketBase's (person, upload, photo) on the way out, and back again when reading requests.
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

/** Refresh everything that might show changed data (the photo token and profile are left alone so images don't flicker). */
export const refreshAll = (qc: QueryClient) =>
  qc.invalidateQueries({ predicate: (q) => !['signedUrl', 'fileToken', 'profile'].includes(String(q.queryKey[0])) })

// Outgoing: app names → PocketBase names ---------------------------------------------------------------------------
function toPbChange(c: Change, all: Change[]): Record<string, unknown> {
  const data = { ...(c.data ?? {}) }
  const out: Record<string, unknown> = { table: c.table, op: c.op }
  if (c.key) out.key = toPbFields(c.key)
  if (c.table === 'media' && c.op === 'insert') {
    if (!isUploadRef(data.storage_path)) throw new Error('A new photo needs its uploaded file.')
    data.upload = refId(data.storage_path)
    delete data.storage_path
  }
  if (c.table === 'people' && 'photo_path' in data) {
    const ref = data.photo_path
    delete data.photo_path
    // The portrait is a link to a media record: an existing one, or one this same request adds.
    const added = all.find((x) => x.table === 'media' && x.op === 'insert' && x.data?.storage_path === ref)
    data.photo = !ref ? '' : isMediaRef(ref) ? refId(ref) : added ? String(added.data!.id) : ''
  }
  if (c.op !== 'delete') out.data = toPbFields(data)
  return out
}

export async function submitChanges(treeId: string, summary: string, subject: string | null, changes: Change[]): Promise<Submitted> {
  return call(pb.send<Submitted>('/api/sft/submit', {
    method: 'POST',
    body: { tree: treeId, summary, subject: subject ?? '', changes: changes.map((c) => toPbChange(c, changes)) },
  }))
}

// Incoming: stored requests → app shape (with viewable photo references) --------------------------------------------
type Raw = Record<string, unknown>
const chunks = <T>(xs: T[], n = 40) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

async function fileRefs(collection: 'media' | 'uploads', ids: Set<string>): Promise<MediaRefs> {
  const refs: MediaRefs = new Map()
  for (const part of chunks([...ids].filter(Boolean))) {
    const filter = part.map((_, i) => `id = {:i${i}}`).join(' || ')
    const params = Object.fromEntries(part.map((id, i) => [`i${i}`, id]))
    const rows = await pb.collection(collection).getFullList({ filter: pbFilter(filter, params), fields: 'id,file' }).catch(() => [])
    for (const r of rows) { const ref = fileRef(collection, r.id, r.file); if (ref) refs.set(r.id, ref) }
  }
  return refs
}

async function hydrate(records: RecordModel[]): Promise<ChangeRequest[]> {
  const mediaIds = new Set<string>()
  const uploadIds = new Set<string>()
  for (const r of records) {
    for (const c of (r.changes ?? []) as Raw[]) {
      const d = (c.data ?? {}) as Raw, b = (c.before ?? {}) as Raw
      if (c.table === 'media' && c.op === 'insert') { mediaIds.add(String(d.id ?? '')); uploadIds.add(String(d.upload ?? '')) }
      if (c.table === 'people') { if (d.photo) mediaIds.add(String(d.photo)); if (b.photo) mediaIds.add(String(b.photo)) }
    }
  }
  const [media, uploads] = await Promise.all([fileRefs('media', mediaIds), fileRefs('uploads', uploadIds)])

  return records.map((r) => {
    const changes = ((r.changes ?? []) as Raw[]).map((c): Change => {
      const table = c.table as Table
      const d = (c.data ?? {}) as Raw
      const out: Change = { table, op: c.op as Change['op'] }
      if (c.key) out.key = toApp(table, c.key as Raw)
      if (c.data) {
        const data = toApp<Raw>(table, d, media)
        if (table === 'media' && c.op === 'insert') {
          // Waiting: the upload. Approved: the photo it became.
          data.storage_path = uploads.get(String(d.upload)) ?? media.get(String(d.id)) ?? null
        }
        if (table === 'people' && 'photo' in d) {
          const sibling = ((r.changes ?? []) as Raw[]).find((x) => x.table === 'media' && x.op === 'insert' && (x.data as Raw)?.id === d.photo)
          const siblingData = (sibling?.data ?? {}) as Raw
          data.photo_path = !d.photo ? null : media.get(String(d.photo)) ?? uploads.get(String(siblingData.upload)) ?? null
        }
        out.data = data
      }
      if (c.before) out.before = toApp(table, c.before as Raw, media)
      return out
    })
    return { ...toApp<ChangeRequest>('change_requests', r as Raw), changes }
  })
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
const requests = (options: Record<string, unknown>, limit?: number) => async () => {
  const col = pb.collection('change_requests')
  const rows = limit ? (await call(col.getList(1, limit, options))).items : await call(col.getFullList(options))
  return hydrate(rows)
}

export const useMyRequests = (userId: string | undefined) =>
  useQuery({
    queryKey: ['requests', 'mine', userId],
    enabled: !!userId,
    queryFn: requests({ filter: pbFilter('author = {:u}', { u: userId ?? '' }), sort: '-created_at' }, 100),
  })

/** Requests about one person that are still waiting (an editor sees their own; an admin sees everyone's). */
export const usePendingFor = (personId: string) =>
  useQuery({
    queryKey: ['requests', 'person', personId],
    queryFn: requests({ filter: pbFilter("subject_person = {:p} && status = 'pending'", { p: personId }), sort: 'created_at' }),
  })

export const useReviewQueue = (enabled: boolean) =>
  useQuery({
    queryKey: ['requests', 'queue'],
    enabled,
    queryFn: requests({ filter: "status = 'pending'", sort: 'created_at' }),
  })

export const useRecentHistory = (enabled: boolean) =>
  useQuery({
    queryKey: ['requests', 'history'],
    enabled,
    queryFn: requests({ filter: "status != 'pending'", sort: '-created_at' }, 60),
  })

export const usePendingReviewCount = (enabled: boolean) =>
  useQuery({
    queryKey: ['reviewCount'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => (await call(pb.send<{ reviews: number }>('/api/sft/counts', {}))).reviews ?? 0,
  })

// Acting on requests -----------------------------------------------------------------------------------------------------
function useAction<T>(path: string, toBody: (v: T) => Record<string, unknown>, done?: (v: T) => void) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: T) => { await call(pb.send(path, { method: 'POST', body: toBody(v) })) },
    onSuccess: (_r, v) => { refreshAll(qc); done?.(v) },
    onError: (e: Error) => toast('error', 'That did not work', e.message),
  })
}

export const useReviewRequest = () =>
  useAction<{ id: string; approve: boolean; note?: string }>('/api/sft/review', (v) => ({ id: v.id, approve: v.approve, note: v.note ?? '' }),
    (v) => toast('saved', v.approve ? 'Approved and added to the tree' : 'Declined'))
export const useWithdrawRequest = () => useAction<string>('/api/sft/withdraw', (id) => ({ id }), () => toast('saved', 'Suggestion withdrawn'))
export const useRevertRequest = () => useAction<string>('/api/sft/revert', (id) => ({ id }), () => toast('saved', 'Change undone'))
/** "This is me". Admins' links apply at once; everyone else's wait for an admin to confirm. */
export function useClaimPerson() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string | null) => { await call(pb.send('/api/sft/claim', { method: 'POST', body: { person: id } })) },
    onSuccess: async (_r, id) => {
      await qc.invalidateQueries({ queryKey: ['profile'] })
      refreshAll(qc)
      const me = pb.authStore.record ? await pb.collection('users').getOne(pb.authStore.record.id, { fields: 'person_status' }).catch(() => null) : null
      if (!id) toast('saved', 'Link removed')
      else if (me?.person_status === 'approved') toast('saved', 'Linked to your account', 'Your initials at the top (or Your profile in the Menu on a phone) bring you back to it.')
      else toast('review', 'Profile link requested', `${ADMIN_NAME} will confirm it’s you.`)
    },
    onError: (e: Error) => toast('error', 'That did not work', e.message),
  })
}
export const useReviewClaim = () =>
  useAction<{ profile: string; approve: boolean }>('/api/sft/review-claim', (v) => ({ user: v.profile, approve: v.approve }),
    (v) => toast('saved', v.approve ? 'Profile link confirmed' : 'Profile link declined'))
