/// <reference path="../pb_data/types.d.ts" />
// The review system's endpoints (PocketBase versions of the Supabase RPCs):
//
//   POST /api/sft/submit        {tree, summary, subject?, changes}  -> {id, status}   (was submit_changes)
//   POST /api/sft/review        {id, approve, note?}                                 (was review_request)
//   POST /api/sft/withdraw      {id}                                                 (was withdraw_request)
//   POST /api/sft/revert        {id}                                                 (was revert_request)
//   POST /api/sft/claim         {person | null}                                      (was claim_person)
//   POST /api/sft/review-claim  {user, approve}                                      (was review_claim)
//   GET  /api/sft/counts        -> {reviews, members}    (pending_review_count + pending_member_count)
//
// Everything runs in one transaction per call: a change request applies completely or not at all.

routerAdd("POST", "/api/sft/submit", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  const user = e.auth
  if (!lib.canEdit(user)) throw new ForbiddenError(lib.MSG.cantEdit)
  const body = e.requestInfo().body || {}
  const treeId = String(body.tree || "")
  const changes = body.changes
  if (!Array.isArray(changes) || changes.length === 0) lib.fail("Nothing to submit.")
  let result = null
  $app.runInTransaction((tx) => {
    if (!lib.findOrNull(tx, "trees", treeId)) lib.fail("That tree doesn't exist.")
    const prepared = changes.map((c) => lib.prepareChange(tx, treeId, c, user))
    const req = new Record(tx.findCollectionByNameOrId("change_requests"))
    req.set("tree", treeId)
    req.set("author", user.id)
    req.set("summary", String(body.summary || "Change").slice(0, 300))
    req.set("subject_person", String(body.subject || ""))
    req.set("changes", prepared)
    req.set("status", "pending")
    tx.save(req)
    if (lib.isAdmin(user)) lib.applyRequest(tx, req, user)
    result = { id: req.id, status: req.getString("status") }
  })
  return e.json(200, result)
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/sft/review", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  if (!lib.isAdmin(e.auth)) throw new ForbiddenError("Only admins can review changes.")
  const body = e.requestInfo().body || {}
  const note = body.note ? String(body.note).slice(0, 5000) : ""
  $app.runInTransaction((tx) => {
    const req = lib.findOrNull(tx, "change_requests", String(body.id || ""))
    if (!req || req.getString("status") !== "pending") lib.fail("This change has already been handled.")
    if (body.approve) {
      lib.applyRequest(tx, req, e.auth)
      req.set("review_note", note)
      tx.save(req)
    } else {
      req.set("status", "rejected")
      req.set("review_note", note)
      req.set("reviewed_by", e.auth.id)
      req.set("reviewed_at", new DateTime())
      tx.save(req)
      lib.dropUploads(tx, req)
    }
  })
  return e.json(200, { ok: true })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/sft/withdraw", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  const body = e.requestInfo().body || {}
  $app.runInTransaction((tx) => {
    const req = lib.findOrNull(tx, "change_requests", String(body.id || ""))
    if (!req || req.getString("author") !== e.auth.id || req.getString("status") !== "pending") {
      lib.fail("Only your own changes that are still waiting can be withdrawn.")
    }
    req.set("status", "withdrawn")
    tx.save(req)
    lib.dropUploads(tx, req)
  })
  return e.json(200, { ok: true })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/sft/revert", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  if (!lib.isAdmin(e.auth)) throw new ForbiddenError("Only admins can undo changes.")
  const body = e.requestInfo().body || {}
  $app.runInTransaction((tx) => {
    const req = lib.findOrNull(tx, "change_requests", String(body.id || ""))
    if (!req || req.getString("status") !== "approved") lib.fail("Only approved changes can be undone.")
    lib.revertRequest(tx, req, e.auth)
  })
  return e.json(200, { ok: true })
}, $apis.requireAuth("users"))

// "This is me": link your account to a person in the tree. Admins' links apply at once.
routerAdd("POST", "/api/sft/claim", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  const user = e.auth
  if (!lib.isApproved(user)) lib.fail("Your account has not been approved yet.")
  const body = e.requestInfo().body || {}
  $app.runInTransaction((tx) => {
    const me = tx.findRecordById("users", user.id)
    if (!body.person) {
      me.set("person", "")
      me.set("person_status", "")
    } else {
      const personId = String(body.person)
      if (!lib.findOrNull(tx, "people", personId)) lib.fail("That person is not in the tree.")
      const taken = tx.findRecordsByFilter("users", "person = {:p} && person_status = 'approved' && id != {:me}", "", 1, 0, { p: personId, me: user.id })
      if (taken.length) lib.fail("Someone else has already linked their account to this person.")
      me.set("person", personId)
      me.set("person_status", lib.isAdmin(user) ? "approved" : "pending")
    }
    tx.save(me)
  })
  return e.json(200, { ok: true })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/sft/review-claim", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  if (!lib.isAdmin(e.auth)) throw new ForbiddenError("Only admins can review profile links.")
  const body = e.requestInfo().body || {}
  $app.runInTransaction((tx) => {
    const u = lib.findOrNull(tx, "users", String(body.user || ""))
    if (!u) lib.fail("That account no longer exists.")
    if (body.approve) {
      if (!u.getString("person")) lib.fail("That account isn't asking to be linked to anyone.")
      u.set("person_status", "approved")
    } else {
      u.set("person", "")
      u.set("person_status", "")
    }
    tx.save(u)
  })
  return e.json(200, { ok: true })
}, $apis.requireAuth("users"))

// The admin links a member's account to their person in the tree, or clears the link.
routerAdd("POST", "/api/sft/link-member", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  if (!lib.isAdmin(e.auth)) throw new ForbiddenError("Only admins can link members to the tree.")
  const body = e.requestInfo().body || {}
  $app.runInTransaction((tx) => {
    const u = lib.findOrNull(tx, "users", String(body.user || ""))
    if (!u) lib.fail("That account no longer exists.")
    if (!body.person) {
      u.set("person", "")
      u.set("person_status", "")
    } else {
      const personId = String(body.person)
      if (!lib.findOrNull(tx, "people", personId)) lib.fail("That person is not in the tree.")
      const taken = tx.findRecordsByFilter("users", "person = {:p} && person_status = 'approved' && id != {:u}", "", 1, 0, { p: personId, u: u.id })
      if (taken.length) lib.fail(`${taken[0].getString("name") || taken[0].email()} is already linked to this person.`)
      u.set("person", personId)
      u.set("person_status", "approved")
    }
    tx.save(u)
  })
  return e.json(200, { ok: true })
}, $apis.requireAuth("users"))

// Badges for the admin: changes and profile links waiting for review, and accounts waiting for approval.
routerAdd("GET", "/api/sft/counts", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  if (!lib.isAdmin(e.auth)) return e.json(200, { reviews: 0, members: 0 })
  const reviews = $app.countRecords("change_requests", $dbx.exp("status = 'pending'"))
    + $app.countRecords("users", $dbx.exp("person_status = 'pending'"))
  const members = $app.countRecords("users", $dbx.exp("status = 'pending'"))
  return e.json(200, { reviews, members })
}, $apis.requireAuth("users"))
