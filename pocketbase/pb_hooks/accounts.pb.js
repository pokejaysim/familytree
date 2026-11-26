/// <reference path="../pb_data/types.d.ts" />
// Sign-ups and uploads.
//
// - A new account is always pending and view-only, whatever the sign-up form sends; only an
//   admin (or the dashboard) can approve it. It gets a confirm-your-email message, and the admins
//   get a note that someone is waiting. If email isn't set up yet, sign-up still works.
// - Each member's last visit is noted (last_seen) for the Admin page, at most every 10 minutes.
// - The welcome video is marked as seen (welcomed_at) so it only plays on a member's first sign-in.
// - The Help page's message form emails the admins. Anyone can use it (people who can't sign in need
//   it most), so it's limited: 3 messages an hour from one address and 30 an hour in all, plus a
//   hidden "website" field that only spam robots fill in.
// - An upload always belongs to whoever uploaded it and starts out "pending" (waiting for review).
// - Every night, abandoned uploads are cleared away, along with kept copies of deleted photos
//   that are old enough that nobody will undo them.

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    e.record.set("status", "pending")
    e.record.set("role", "viewer")
    e.record.set("person", "")
    e.record.set("person_status", "")
    e.record.set("reviewed_at", "")
    e.record.set("reviewed_by", "")
    e.record.set("emailVisibility", false)
    e.record.setVerified(false)
  }
  e.next()
  if (e.record.verified()) return

  try {
    $mails.sendRecordVerification($app, e.record)
  } catch (err) {
    console.log("sft: couldn't send the confirmation email (is email set up?)", String(err))
    $app.logger().warn("sft: couldn't send the confirmation email", "error", String(err)) // shown on the Admin page
  }
  try {
    const meta = $app.settings().meta
    const admins = $app.findRecordsByFilter("users", "role = 'admin' && status = 'approved'", "", 20, 0)
    if (!admins.length || !meta.senderAddress) return
    const name = e.record.getString("name") || "Someone"
    const note = e.record.getString("note")
    $app.newMailClient().send(new MailerMessage({
      from: { address: meta.senderAddress, name: meta.senderName },
      to: admins.map((a) => ({ address: a.email(), name: a.getString("name") })),
      subject: `${name} wants to join the family tree`,
      text: `${name} (${e.record.email()}) just signed up${note ? ` and wrote: "${note}"` : ""}.\n\n`
        + "Their account can't see anything until you approve it on the Admin page:\n"
        + `${meta.appURL}/admin`,
    }))
  } catch (err) {
    console.log("sft: couldn't email the admins about a sign-up", String(err))
    $app.logger().warn("sft: couldn't email the admins about a sign-up", "error", String(err)) // shown on the Admin page
  }
}, "users")

// Signing in and the app's start-up check (auth-refresh) both count as a visit.
onRecordAuthRequest((e) => {
  e.next()
  try {
    const now = new DateTime()
    const last = e.record.getDateTime("last_seen")
    if (!last.isZero() && now.unix() - last.unix() < 600) return
    $app.db().newQuery("UPDATE users SET last_seen = {:t} WHERE id = {:id}").bind({ t: now.string(), id: e.record.id }).execute()
  } catch (err) {
    console.log("sft: couldn't note a visit", String(err))
  }
}, "users")

// The signed-in member has seen the welcome video. Only ever marks your own account, and only once.
routerAdd("POST", "/api/sft/welcomed", (e) => {
  $app.db().newQuery("UPDATE users SET welcomed_at = {:t} WHERE id = {:id} AND (welcomed_at = '' OR welcomed_at IS NULL)")
    .bind({ t: new DateTime().string(), id: e.auth.id }).execute()
  return e.json(200, { ok: true })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/sft/contact", (e) => {
  const body = e.requestInfo().body || {}
  const name = String(body.name || "").trim().slice(0, 100)
  const email = String(body.email || "").trim().slice(0, 200)
  const message = String(body.message || "").trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestError("Please give an email address so Jason can reply.")
  if (message.length < 5) throw new BadRequestError("Please write a message.")
  if (message.length > 5000) throw new BadRequestError("That message is too long. Please keep it under 5,000 characters.")
  if (body.website) return e.json(200, { ok: true }) // a robot filled in the hidden field: pretend it worked

  // Limits, counted in memory (they reset if the server restarts, which is fine).
  const now = Date.now()
  const recent = (key, max) => {
    const hits = String($app.store().get(key) || "").split(",").filter((t) => t && now - Number(t) < 3600000)
    if (hits.length >= max) return false
    hits.push(String(now))
    $app.store().set(key, hits.join(","))
    return true
  }
  if (!recent("sft-contact:" + e.realIP(), 3) || !recent("sft-contact:all", 30)) {
    throw new ApiError(429, "Too many messages in a short time. Please try again in an hour.", {})
  }

  const meta = $app.settings().meta
  const admins = $app.findRecordsByFilter("users", "role = 'admin' && status = 'approved'", "", 20, 0)
  if (!admins.length || !meta.senderAddress) throw new ApiError(503, "Messages can't be sent right now. Please try again later.", {})
  const who = e.auth && e.auth.collection().name === "users"
    ? `Signed in as ${e.auth.getString("name") || e.auth.email()} (${e.auth.email()}, ${e.auth.getString("status")}).`
    : "Not signed in."
  try {
    $app.newMailClient().send(new MailerMessage({
      from: { address: meta.senderAddress, name: meta.senderName },
      to: admins.map((a) => ({ address: a.email(), name: a.getString("name") })),
      headers: { "Reply-To": email },
      subject: `${name || "Someone"} sent a message from the family tree`,
      text: `${name || "Someone"} (${email}) wrote:\n\n${message}\n\n---\n${who}\nReply to this email to answer them.`,
    }))
  } catch (err) {
    console.log("sft: couldn't send a Help page message", String(err))
    $app.logger().warn("sft: couldn't send a Help page message", "error", String(err)) // shown on the Admin page
    throw new ApiError(502, "Your message couldn't be sent just now. Please try again in a few minutes.", {})
  }
  return e.json(200, { ok: true })
})

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    e.record.set("owner", e.auth ? e.auth.id : "")
    e.record.set("purpose", "pending")
    e.record.set("media_id", "")
  }
  e.next()
}, "uploads")

// 11:30 UTC = 3:30 am Pacific (4:30 in summer).
cronAdd("sft-tidy-uploads", "30 11 * * *", () => {
  const ago = (days) => new Date(Date.now() - days * 86400000).toISOString().replace("T", " ")
  const stale = $app.findRecordsByFilter("uploads", "purpose = 'pending' && created_at < {:t}", "", 500, 0, { t: ago(14) })
  for (const up of stale) {
    const waiting = $app.countRecords("change_requests", $dbx.exp("status = 'pending' AND changes LIKE {:p}", { p: "%" + up.id + "%" }))
    if (!waiting) $app.delete(up)
  }
  for (const up of $app.findRecordsByFilter("uploads", "purpose = 'trash' && created_at < {:t}", "", 500, 0, { t: ago(365) })) {
    $app.delete(up)
  }
})
