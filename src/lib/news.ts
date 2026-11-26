import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RecordModel } from 'pocketbase'
import { call, pb } from './pb'
import { useAuth } from './auth'

/**
 * Family news (pocketbase/pb_hooks/news.pb.js): posts on the News page that an admin can also email to
 * every member. Members read; admins write, edit, delete and send.
 */
export interface NewsPost {
  id: string
  title: string
  body: string
  /** "news/<id>/<file>" for useSignedUrl, or null. */
  photo: string | null
  author_id: string | null
  emailed_at: string | null
  /** How many members it has been emailed to so far. */
  emailed_count: number
  created_at: string
}

const iso = (v: unknown) => (v ? String(v).replace(' ', 'T') : null)
const toPost = (r: RecordModel): NewsPost => ({
  id: r.id,
  title: String(r.title ?? ''),
  body: String(r.body ?? ''),
  photo: r.photo ? `news/${r.id}/${r.photo}` : null,
  author_id: r.author || null,
  emailed_at: iso(r.emailed_at),
  emailed_count: Number(r.emailed_count ?? 0),
  created_at: iso(r.created) ?? '',
})

export const useNews = () =>
  useQuery({ queryKey: ['news'], queryFn: async () => (await call(pb.collection('news').getFullList({ sort: '-created' }))).map(toPost) })

/** The newest post, for the header's "new" dot and the home page (one small request). */
export const useLatestNews = () => {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['news', 'latest'],
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await call(pb.collection('news').getList(1, 1, { sort: '-created', fields: 'id,title,created' }))
      return r.items[0] ? { id: r.items[0].id, title: String(r.items[0].title), created_at: iso(r.items[0].created) ?? '' } : null
    },
  })
}

/** Remembered per member on each device: the newest post they've seen, so the header can mark new ones. */
const seenKey = (uid: string) => `sft-news-seen:${uid}`
export const newsSeen = (uid: string | undefined) => { try { return uid ? localStorage.getItem(seenKey(uid)) ?? '' : '' } catch { return '' } }
export const markNewsSeen = (uid: string | undefined, createdAt: string) => {
  try { if (uid && createdAt > newsSeen(uid)) { localStorage.setItem(seenKey(uid), createdAt); window.dispatchEvent(new Event('sft-news-seen')) } } catch { /* storage unavailable */ }
}

export interface NewsDraft { title: string; body: string; photo?: File | null; removePhoto?: boolean }

export function useSaveNews() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: NewsDraft }) => {
      const form = new FormData()
      form.append('title', draft.title.trim())
      form.append('body', draft.body.trim())
      if (draft.photo) form.append('photo', draft.photo)
      else if (draft.removePhoto) form.append('photo', '')
      return toPost(await call(id ? pb.collection('news').update(id, form) : pb.collection('news').create(form)))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['news'] }),
  })
}

export function useDeleteNews() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => { await call(pb.collection('news').delete(id)) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['news'] }),
  })
}

/**
 * Email a post to every member who hasn't had it yet. The server sends a few at a time, so this keeps
 * asking until nobody is left, reporting progress as it goes. The first call says `again`, so anyone
 * whose email failed last time is tried once more.
 */
export async function sendNews(id: string, onProgress: (sent: number) => void) {
  let sent = 0
  let failed = 0
  for (let i = 0; i < 100; i++) {
    const r = await call(pb.send<{ sent: number; failed: number; remaining: number }>(`/api/sft/news/${encodeURIComponent(id)}/send`, { method: 'POST', body: { again: i === 0 } }))
    sent += r.sent; failed += r.failed
    onProgress(sent)
    if (r.remaining === 0) break
  }
  return { sent, failed }
}

/** Switch the news emails on or off for your own account. */
export const setNewsEmails = (on: boolean) => call(pb.send<{ on: boolean }>('/api/sft/news/emails', { method: 'POST', body: { on } }))

/** The "stop these emails" link from a news email (…/?news-off=<user>.<key>); works signed out. */
export const stopNewsEmails = (link: string) => {
  const [u, k] = link.split('.')
  return call(pb.send('/api/sft/news/off', { method: 'POST', body: { u, k } }))
}
