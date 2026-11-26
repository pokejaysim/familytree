/// <reference path="../pb_data/types.d.ts" />
// Family news: posts on the News page (collection "news", migration 1765500000) that an admin can
// also email to every approved member.
//
// - Posts always belong to the admin who wrote them, and the email tally can't be changed by hand.
// - POST /api/sft/news/{id}/send {again?} (admins): emails the post to approved members who haven't
//   switched the emails off and haven't had this post yet, a few at a time so no single request runs
//   long; the Admin's browser calls it again until nobody is left. An email that fails is skipped for
//   the rest of that run (so one bad address can't hold things up) and tried again on the next run,
//   which the browser starts with {again: true}. Each member gets their own email (no
//   one sees anyone else's address), replies go to the admin who sent it, and every email ends with
//   a "stop these emails" link (also given to mail apps as List-Unsubscribe).
// - POST /api/sft/news/emails {on} (signed in): switch the emails on or off for your own account.
// - POST /api/sft/news/off {u, k}: the "stop these emails" link, which works without signing in.
//   k is the member's random unsub_key, so nobody can switch off someone else's emails.

onRecordCreateRequest((e) => {
  e.record.set("author", e.auth && e.auth.collection().name === "users" ? e.auth.id : "")
  e.record.set("emailed_at", "")
  e.record.set("emailed_count", 0)
  e.record.set("sent_to", null)
  e.record.set("failed_to", null)
  e.next()
}, "news")

onRecordUpdateRequest((e) => {
  const was = e.record.original()
  for (const f of ["author", "emailed_at", "emailed_count", "sent_to", "failed_to"]) e.record.set(f, was.get(f))
  e.next()
}, "news")

routerAdd("POST", "/api/sft/news/{id}/send", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  if (!lib.isAdmin(e.auth)) throw new ForbiddenError("Only admins can send family news.")
  const BATCH = 8
  const meta = $app.settings().meta
  if (!meta.senderAddress) lib.fail("Email isn’t set up on the server, so the news can’t be emailed.")
  let post
  try { post = $app.findRecordById("news", e.request.pathValue("id")) } catch (_) { throw new NotFoundError("That post doesn’t exist any more.") }

  const sent = lib.json(post, "sent_to") || []
  const failedBefore = (e.requestInfo().body || {}).again ? [] : (lib.json(post, "failed_to") || [])
  const failedNow = []
  const everyone = $app.findRecordsByFilter("users", "status = 'approved' && news_emails_off != true && email != ''", "created", 0, 0)
  const waiting = everyone.filter((u) => !sent.includes(u.id) && !failedBefore.includes(u.id))
  const batch = waiting.slice(0, BATCH)

  // The post, as plain paragraphs (the same light markup as the News page: a **line** in bold).
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  const title = post.getString("title").replace(/[\x00-\x1f\x7f]+/g, " ").trim()
  const paras = post.getString("body").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const html = paras.map((p) => /^\*\*.+\*\*$/s.test(p) ? `<p><strong>${esc(p.slice(2, -2))}</strong></p>` : `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n")
  const text = paras.map((p) => p.replace(/^\*\*(.+)\*\*$/s, "$1")).join("\n\n")
  const link = `${meta.appURL}/news/${post.id}`
  const photoLine = post.getString("photo") ? "There’s a photo with it on the family tree." : ""
  const sender = e.auth

  let ok = 0
  let failed = 0
  for (const u of batch) {
    const first = (u.getString("name").trim().split(/\s+/)[0] || "").replace(/[\x00-\x1f\x7f<>&"]+/g, "")
    const off = `${meta.appURL}/?news-off=${u.id}.${u.getString("unsub_key")}`
    try {
      $app.newMailClient().send(new MailerMessage({
        from: { address: meta.senderAddress, name: meta.senderName },
        to: [{ address: u.email(), name: u.getString("name") }],
        subject: `Family news: ${title}`,
        headers: { "Reply-To": sender.email(), "List-Unsubscribe": `<${off}>` },
        html: [
          `<p>Hello${first ? " " + first : ""},</p>`,
          `<h2 style="font-family:Georgia,serif;font-weight:normal;color:#2E4A38">${esc(title)}</h2>`,
          html,
          photoLine ? `<p>${photoLine}</p>` : "",
          `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2E4A38;color:#FAF8F3;border-radius:6px;text-decoration:none">Read it on the family tree</a></p>`,
          `<p>The ${esc(meta.appName)}</p>`,
          `<p style="font-size:13px;color:#6F6A5E">You’re getting this because you’re a member of the ${esc(meta.appName)}. Reply to this email to answer. <a href="${off}" style="color:#6F6A5E">Stop these emails</a></p>`,
        ].filter(Boolean).join("\n"),
        text: `Hello${first ? " " + first : ""},\n\n${title}\n\n${text}\n\n${photoLine ? photoLine + "\n\n" : ""}Read it on the family tree: ${link}\n\nThe ${meta.appName}\n\n---\nYou’re getting this because you’re a member of the ${meta.appName}. Reply to this email to answer.\nStop these emails: ${off}`,
      }))
      ok++
      sent.push(u.id)
    } catch (err) {
      failed++
      failedNow.push(u.id)
      console.log("sft: couldn't send family news", String(err))
      $app.logger().warn("sft: couldn't send family news", "error", String(err), "post", post.id) // shown on the Admin page
    }
  }

  post.set("sent_to", sent)
  post.set("failed_to", [...failedBefore, ...failedNow])
  post.set("emailed_count", post.getInt("emailed_count") + ok)
  if (ok && !post.getString("emailed_at")) post.set("emailed_at", new DateTime())
  $app.save(post)
  return e.json(200, { sent: ok, failed, remaining: waiting.length - batch.length, emailed: post.getInt("emailed_count") })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/sft/news/emails", (e) => {
  const on = !!(e.requestInfo().body || {}).on
  const me = $app.findRecordById("users", e.auth.id)
  me.set("news_emails_off", !on)
  $app.save(me)
  return e.json(200, { on })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/sft/news/off", (e) => {
  const body = e.requestInfo().body || {}
  const u = String(body.u || "")
  const k = String(body.k || "")
  let rec = null
  try { rec = $app.findRecordById("users", u) } catch (_) { /* treated as a bad link */ }
  if (!rec || k.length < 16 || rec.getString("unsub_key") !== k) throw new BadRequestError("That link doesn’t work. Sign in and use the switch on the News page instead.")
  rec.set("news_emails_off", true)
  $app.save(rec)
  return e.json(200, { ok: true })
})
