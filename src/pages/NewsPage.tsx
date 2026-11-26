import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ImagePlus, Mail, PenLine, Send, Trash2 } from 'lucide-react'
import AppHeader from '../components/AppHeader'
import { Letter } from '../components/IntroPane'
import { useAuth } from '../lib/auth'
import { useIsAdmin, useMembers, useProfile } from '../lib/profile'
import { markNewsSeen, sendNews, setNewsEmails, useDeleteNews, useNews, useSaveNews, type NewsPost } from '../lib/news'
import { useSignedUrl } from '../lib/queries'
import { errorMessage } from '../lib/pb'
import { toast } from '../lib/toast'
import { useQueryClient } from '@tanstack/react-query'

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * Family news: posts from the admins, newest first (/news), or one post (/news/:id, where the emails link).
 * Members can switch the news emails on or off here. Admins write, edit, delete and email posts
 * (lib/news.ts, pocketbase/pb_hooks/news.pb.js).
 */
export default function NewsPage() {
  const { postId } = useParams()
  const { session } = useAuth()
  const isAdmin = useIsAdmin()
  const { data: posts, isLoading, error } = useNews()
  const [writing, setWriting] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  useEffect(() => { if (posts?.[0]) markNewsSeen(session?.user.id, posts[0].created_at) }, [posts, session])

  const shown = postId ? posts?.filter((p) => p.id === postId) : posts
  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="min-h-0 flex-1 overflow-auto">
        <article className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
          {postId
            ? <p className="text-[16px]"><Link to="/news" className="text-brass underline underline-offset-4 hover:text-moss">All family news</Link></p>
            : <>
                <h1 className="text-3xl leading-tight sm:text-4xl">Family news</h1>
                <p className="mt-3 text-[17px] leading-relaxed text-ink-soft">News from around the family, newest first.</p>
                <EmailSwitch />
                {isAdmin && !writing && <button className="btn-primary mt-6 min-h-11 px-5 text-[16px]" onClick={() => setWriting(true)}><PenLine size={17} /> Write a post</button>}
                {isAdmin && writing && <Composer onDone={() => setWriting(false)} />}
              </>}

          {isLoading && <p className="mt-10 text-ink-mute">Loading…</p>}
          {error && <p className="mt-10 text-danger">{error.message}</p>}
          {posts && shown?.length === 0 && (
            <p className="card mt-10 text-[16px] text-ink-soft">
              {postId ? 'That post isn’t here any more.' : isAdmin ? 'No news yet. Write the first post above.' : 'No news yet. New posts will show up here.'}
            </p>
          )}
          <div className="mt-10 space-y-8">
            {shown?.map((p) => editing === p.id
              ? <Composer key={p.id} post={p} onDone={() => setEditing(null)} />
              : <PostCard key={p.id} post={p} onEdit={isAdmin ? () => setEditing(p.id) : undefined} />)}
          </div>
          {postId && posts && posts.length > 1 && <p className="mt-10 text-[16px]"><Link to="/news" className="text-brass underline underline-offset-4 hover:text-moss">See all {posts.length} posts</Link></p>}
        </article>
      </main>
    </div>
  )
}

/** "Email me new posts", for your own account. */
function EmailSwitch() {
  const qc = useQueryClient()
  const { data: profile } = useProfile()
  const [busy, setBusy] = useState(false)
  if (!profile) return null
  const on = !profile.news_emails_off
  const flip = async () => {
    setBusy(true)
    try {
      await setNewsEmails(!on)
      await qc.invalidateQueries({ queryKey: ['profile'] })
      toast('saved', on ? 'News emails switched off' : 'News emails switched on', on ? 'New posts will still appear here.' : `New posts will come to ${profile.email}.`)
    } catch (err) {
      toast('error', 'Couldn’t change that', errorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-md border border-line bg-white px-4 py-3">
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-moss" checked={on} disabled={busy} onChange={flip} />
      <span className="text-[16px] leading-snug text-ink">
        Email me new posts
        <span className="block text-[15px] text-ink-mute [overflow-wrap:anywhere]">{on ? `New posts are emailed to ${profile.email}.` : 'You won’t get emails. New posts still appear here.'}</span>
      </span>
    </label>
  )
}

/** Members who'd get an emailed post: approved, and haven't switched the emails off. Admins only. */
function useRecipients() {
  const { data: members = [] } = useMembers()
  return members.filter((m) => m.status === 'approved' && !m.news_emails_off).length
}

/** Email a post, with progress. Returns a function the buttons call. */
function useSender() {
  const qc = useQueryClient()
  const [progress, setProgress] = useState<number | null>(null)
  const send = async (post: { id: string; title: string }) => {
    setProgress(0)
    try {
      const { sent, failed } = await sendNews(post.id, setProgress)
      if (failed) toast('error', `Emailed to ${sent}, but ${failed} didn’t send`, 'Site health on the Admin page says what went wrong. Press Email again later to try those once more.')
      else toast('saved', sent ? `Emailed to ${sent} ${sent === 1 ? 'person' : 'people'}` : 'Nobody new to email', sent ? `“${post.title}” is on its way.` : 'Everyone who wants the emails has had this one.')
    } catch (err) {
      toast('error', 'The emails didn’t all go', `${errorMessage(err)} Try again. Nobody gets it twice.`)
    } finally {
      setProgress(null)
      qc.invalidateQueries({ queryKey: ['news'] })
    }
  }
  return { send, progress }
}

/** Write a new post, or edit one. A new post can be emailed as soon as it's posted. */
function Composer({ post, onDone }: { post?: NewsPost; onDone: () => void }) {
  const save = useSaveNews()
  const recipients = useRecipients()
  const sender = useSender()
  const [title, setTitle] = useState(post?.title ?? '')
  const [body, setBody] = useState(post?.body ?? '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const busy = save.isPending || sender.progress !== null

  const submit = async (e: FormEvent | { preventDefault: () => void }, email: boolean) => {
    e.preventDefault(); setProblem(null)
    if (!title.trim()) { setProblem('Give the post a title.'); return }
    if (email && !confirm(`Post this and email “${title.trim()}” to ${recipients} ${recipients === 1 ? 'person' : 'people'}? Emails can’t be taken back.`)) return
    try {
      const saved = await save.mutateAsync({ id: post?.id, draft: { title, body, photo, removePhoto } })
      if (email) await sender.send(saved)
      else toast('saved', post ? 'Post updated' : 'Posted', post ? undefined : 'It’s on the News page now. You can email it from there any time.')
      onDone()
    } catch (err) {
      setProblem(errorMessage(err))
    }
  }

  return (
    <form onSubmit={(e) => submit(e, false)} className="card mt-6 space-y-4">
      <h2 className="text-[22px] leading-tight">{post ? 'Edit this post' : 'Write a post'}</h2>
      <label className="block"><span className="label">Title</span><input className="input" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. A new great-grandchild" autoFocus /></label>
      <label className="block">
        <span className="label">What’s the news?</span>
        <textarea className="input min-h-48" maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} />
        <span className="mt-1 block text-[14px] text-ink-mute">Leave a blank line between paragraphs. Put **two stars** around a line to make it stand out, like a date.</span>
      </label>
      <div>
        <span className="label">Photo (optional)</span>
        <label className="btn-ghost cursor-pointer"><ImagePlus size={16} /> {photo ? 'Choose a different photo' : post?.photo && !removePhoto ? 'Replace the photo' : 'Add a photo'}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); setRemovePhoto(false) }} />
        </label>
        {photo && <p className="mt-2 text-[15px] text-ink-soft [overflow-wrap:anywhere]">{photo.name} <button type="button" className="ml-2 text-brass underline underline-offset-2" onClick={() => setPhoto(null)}>Don’t add it</button></p>}
        {post?.photo && !photo && (
          <label className="mt-2 flex items-center gap-2 text-[15px] text-ink-soft"><input type="checkbox" className="h-4 w-4 accent-moss" checked={removePhoto} onChange={(e) => setRemovePhoto(e.target.checked)} /> Remove the current photo</label>
        )}
      </div>
      {problem && <p role="alert" className="text-[15px] text-danger">{problem}</p>}
      {sender.progress !== null && <p role="status" className="text-[15px] text-moss">Emailing… {sender.progress} of {recipients} sent</p>}
      <div className="flex flex-wrap gap-2">
        {post
          ? <button className="btn-primary" disabled={busy}>{save.isPending ? 'Saving…' : 'Save'}</button>
          : <>
              <button type="button" className="btn-primary" disabled={busy || recipients === 0} onClick={(e) => submit(e, true)}><Send size={15} /> Post and email {recipients} {recipients === 1 ? 'person' : 'people'}</button>
              <button className="btn-ghost" disabled={busy}>Just post it</button>
            </>}
        <button type="button" className="btn-ghost" disabled={busy} onClick={onDone}>Cancel</button>
      </div>
      {!post && <p className="text-[14px] text-ink-mute">Everyone who’s been approved can read it on the News page. Members who switched the emails off still see it here.</p>}
    </form>
  )
}

function PostCard({ post, onEdit }: { post: NewsPost; onEdit?: () => void }) {
  const { data: photo } = useSignedUrl(post.photo, '1200x0')
  const { data: full } = useSignedUrl(post.photo)
  return (
    <section className="card space-y-4" aria-labelledby={`news-${post.id}`}>
      <div>
        <p className="text-[15px] text-ink-mute">{day(post.created_at)}</p>
        <h2 id={`news-${post.id}`} className="mt-1 text-[26px] leading-tight text-ink">
          <Link to={`/news/${post.id}`} className="hover:text-moss">{post.title}</Link>
        </h2>
      </div>
      {photo && <a href={full} target="_blank" rel="noreferrer"><img src={photo} alt="Photo with this post" className="max-h-[480px] w-full rounded-md border border-line object-cover" loading="lazy" /></a>}
      {post.body && <Letter text={post.body} />}
      {onEdit && <AdminBar post={post} onEdit={onEdit} />}
    </section>
  )
}

/** Under each post, for admins: whether it was emailed, and Email / Edit / Delete. */
function AdminBar({ post, onEdit }: { post: NewsPost; onEdit: () => void }) {
  const remove = useDeleteNews()
  const recipients = useRecipients()
  const sender = useSender()
  const sending = sender.progress !== null
  const email = () => {
    const msg = post.emailed_count
      ? `Email “${post.title}” to anyone who hasn’t had it yet (new members, or anyone whose email didn’t go through)? Nobody gets it twice.`
      : `Email “${post.title}” to ${recipients} ${recipients === 1 ? 'person' : 'people'}? Emails can’t be taken back.`
    if (confirm(msg)) sender.send(post)
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[15px] text-ink-mute">
      <span className="mr-auto">
        {sending ? `Emailing… ${sender.progress} sent` : post.emailed_count ? `Emailed to ${post.emailed_count} ${post.emailed_count === 1 ? 'person' : 'people'}, ${day(post.emailed_at ?? post.created_at)}` : 'Not emailed'}
      </span>
      <button className="btn-ghost" disabled={sending || recipients === 0} onClick={email}><Mail size={15} /> {post.emailed_count ? 'Email anyone new' : 'Email it to everyone'}</button>
      <button className="btn-ghost" disabled={sending} onClick={onEdit}><PenLine size={15} /> Edit</button>
      <button className="btn-ghost" disabled={sending || remove.isPending} onClick={() => { if (confirm(`Delete “${post.title}”? It disappears from the News page. Emails already sent can’t be taken back.`)) remove.mutate(post.id, { onSuccess: () => toast('saved', 'Post deleted') }) }}><Trash2 size={15} /> Delete</button>
    </div>
  )
}
