import PocketBase, { ClientResponseError } from 'pocketbase'

/**
 * The PocketBase client, plus the translation between PocketBase records and the shapes the
 * rest of the app uses (which kept the Supabase column names, so the pages didn't change):
 *
 * - links get their "_id" back: `person` ⇄ `person_id`, `tree` ⇄ `tree_id`, …
 * - empty text comes back as null; sort dates as "YYYY-MM-DD"; timestamps as ISO strings
 * - files are passed around as references "<collection>/<recordId>/<filename>":
 *   `media.storage_path` is the photo's own file, `people.photo_path` its portrait's file,
 *   and a photo waiting for review is "uploads/<id>/<filename>". `useSignedUrl` turns a
 *   reference into a viewable URL.
 */
const url = import.meta.env.VITE_PB_URL as string | undefined
if (!url) throw new Error('Missing VITE_PB_URL in .env.local')

export const pb = new PocketBase(url)
// React Query already avoids duplicate requests; the SDK's own auto-cancel would cancel parallel ones.
pb.autoCancellation(false)

/** The words to show for a failed request (including PocketBase's per-field validation messages). */
export function errorMessage(e: unknown): string {
  if (e instanceof ClientResponseError) {
    if (e.status === 0) return "Couldn't reach the family tree server. Check your connection and try again."
    const fields = Object.entries((e.response?.data ?? {}) as Record<string, { message?: string }>)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v?.message ?? 'invalid'}`)
    const base = e.response?.message || e.message
    return fields.length ? `${base} (${fields.join('; ')})` : base
  }
  return e instanceof Error ? e.message : String(e)
}

/** Run a PocketBase call and turn its error into a plain Error with a readable message. */
export async function call<T>(p: Promise<T>): Promise<T> {
  try {
    return await p
  } catch (e) {
    throw new Error(errorMessage(e))
  }
}

export const pbFilter = (expr: string, params: Record<string, unknown>) => pb.filter(expr, params)

// Field names ---------------------------------------------------------------------------------------------------------
const TO_APP: Record<string, string> = {
  tree: 'tree_id', person: 'person_id', family: 'family_id', source: 'source_id', event: 'event_id',
  partner1: 'partner1_id', partner2: 'partner2_id', owner: 'owner_id', user: 'user_id', author: 'author_id',
  subject_person: 'subject_person_id', request: 'request_id',
}
const TO_PB: Record<string, string> = Object.fromEntries(Object.entries(TO_APP).map(([pbName, appName]) => [appName, pbName]))
const KEEP_EMPTY = new Set(['given_names', 'surname'])
const DATE_ONLY = new Set(['birth_date_sort', 'death_date_sort', 'start_date_sort', 'end_date_sort', 'date_sort'])
const TIMESTAMPS = new Set(['created_at', 'updated_at', 'reviewed_at', 'created', 'updated', 'at'])
const DROP = new Set(['collectionId', 'collectionName', 'expand', 'file', 'photo', 'upload'])

export const fileRef = (collection: string, id: string, file: unknown) => (file ? `${collection}/${id}/${String(file)}` : null)
export const refId = (ref: string) => ref.split('/')[1]
export const isUploadRef = (ref: unknown): ref is string => typeof ref === 'string' && ref.startsWith('uploads/')
export const isMediaRef = (ref: unknown): ref is string => typeof ref === 'string' && ref.startsWith('media/')

/** Media IDs → file references, for portraits whose media record wasn't expanded. */
export type MediaRefs = Map<string, string>

type Row = Record<string, unknown>

/** A PocketBase record (or a stored snapshot of one) in the app's shape. */
export function toApp<T>(table: string, r: Row, mediaRefs?: MediaRefs): T {
  const out: Row = {}
  for (const [k, v] of Object.entries(r)) {
    if (DROP.has(k)) continue
    let value = v
    if (typeof value === 'string') {
      if (value === '' && !KEEP_EMPTY.has(k)) value = null
      else if (DATE_ONLY.has(k)) value = value.slice(0, 10)
      else if (TIMESTAMPS.has(k)) value = value.replace(' ', 'T')
    }
    out[TO_APP[k] ?? k] = value
  }
  // Only when the record (or partial change) actually carries the file / portrait, so a change to
  // someone's nickname doesn't look like it also removed their photo.
  if (table === 'media' && 'file' in r) out.storage_path = fileRef('media', String(r.id), r.file)
  if (table === 'people') {
    const expanded = (r.expand as Row | undefined)?.photo as Row | undefined
    if (expanded) out.photo_path = fileRef('media', String(expanded.id), expanded.file)
    else if ('photo' in r) out.photo_path = r.photo ? mediaRefs?.get(String(r.photo)) ?? null : null
  }
  return out as T
}

/** App-shaped values → PocketBase field names (null clears a field). */
export function toPbFields(data: Row | undefined | null): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(data ?? {})) out[TO_PB[k] ?? k] = v === null ? '' : v
  return out
}
