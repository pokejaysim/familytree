/// <reference path="../pb_data/types.d.ts" />
// Shared helpers for the review system. PocketBase runs every hook handler in its own isolated
// context, so each handler loads this file with require(`${__hooks}/sft_lib.js`).
//
// This is a port of supabase/migrations/20261013000000_reviewed_contributions.sql:
// - One user action = one change request: an ordered list of {table, op, key, data} row changes,
//   using PocketBase field names (person, family, tree; not person_id).
// - Admins' requests apply at once; everyone else's wait for an admin.
// - Every applied row change, including cascades, goes into change_log, so an approved request can be undone.

const EDITABLE = ["people", "families", "family_children", "events", "citations", "sources", "media"]
// Parents before children (used for undo).
const PARENT_FIRST = ["people", "sources", "families", "family_children", "events", "citations", "media"]
// Never changed by an update (tree membership and bookkeeping).
const FIXED = ["id", "tree", "created_at", "updated_at"]
const DEFAULTS = {
  people: { sex: "U" },
  families: { union_type: "marriage" },
  family_children: { relation: "biological", sort_order: 0 },
  citations: { confidence: 2 },
}
const MSG = {
  cantEdit: "Your account can view the tree but not change it yet.",
  adminOnly: "Only admins can do that.",
  gone: "Something this change refers to has since been changed or removed.",
  missingKey: "A change is missing the record it applies to.",
}

const fail = (msg) => { throw new BadRequestError(msg) }

function isApproved(u) { return !!u && u.collection().name === "users" && u.getString("status") === "approved" }
function isAdmin(u) { return isApproved(u) && u.getString("role") === "admin" }
function canEdit(u) { return isApproved(u) && (u.getString("role") === "admin" || u.getString("role") === "editor") }

/** Read a JSON field as a plain value. */
function json(rec, field) {
  const raw = rec.getString(field)
  return raw ? JSON.parse(raw) : null
}

/** A plain copy of a record's fields, as shown on the review screen and kept in the change log. */
function snapshot(rec) {
  const o = JSON.parse(JSON.stringify(rec))
  delete o.collectionId
  delete o.collectionName
  delete o.expand
  return o
}

function findOrNull(app, table, id) {
  try { return app.findRecordById(table, id) } catch (_) { return null }
}

function checkFields(collection, names, extraAllowed) {
  for (const k of names) {
    if (extraAllowed && extraAllowed.includes(k)) continue
    if (!collection.fields.getByName(k)) fail(`There is no "${k}" on ${collection.name}.`)
  }
}

function inTree(app, table, rec, treeId) {
  if (table === "family_children") {
    const fam = findOrNull(app, "families", rec.getString("family"))
    return !!fam && fam.getString("tree") === treeId
  }
  return rec.getString("tree") === treeId
}

/** The record a change's key points at, or null if it's missing or in another tree. */
function findTarget(app, table, key, treeId) {
  if (!key || typeof key !== "object" || Object.keys(key).length === 0) fail(MSG.missingKey)
  const collection = app.findCollectionByNameOrId(table)
  const names = Object.keys(key)
  checkFields(collection, names)
  let rec = null
  if (names.length === 1 && names[0] === "id") rec = findOrNull(app, table, String(key.id))
  else {
    const params = {}
    const filter = names.map((k, i) => { params["k" + i] = key[k]; return `${k} = {:k${i}}` }).join(" && ")
    try { rec = app.findFirstRecordByFilter(table, filter, params) } catch (_) { rec = null }
  }
  return rec && inTree(app, table, rec, treeId) ? rec : null
}

/** A contributor's waiting upload that `author` may use (only their own, unless they're an admin). */
function usableUpload(app, uploadId, author) {
  const upload = findOrNull(app, "uploads", String(uploadId || ""))
  if (!upload || upload.getString("purpose") !== "pending") fail("The uploaded file for this photo is no longer available.")
  if (!author || (upload.getString("owner") !== author.id && !isAdmin(author))) fail("That upload belongs to someone else.")
  return upload
}

/** Check a submitted change before it's stored, and capture the "before" state for review. */
function prepareChange(app, treeId, c, author) {
  if (!c || !EDITABLE.includes(c.table)) fail(`Changes to ${c && c.table} are not supported.`)
  if (!["insert", "update", "delete"].includes(c.op)) fail(`Unknown operation ${c.op}.`)
  const collection = app.findCollectionByNameOrId(c.table)
  const data = c.data && typeof c.data === "object" ? c.data : {}
  checkFields(collection, Object.keys(data), c.table === "media" ? ["upload"] : [])
  if (c.table === "media" && c.op === "insert") usableUpload(app, data.upload, author)
  let before = null
  if (c.op !== "insert") {
    const target = findTarget(app, c.table, c.key, treeId)
    if (!target) fail(MSG.gone)
    before = snapshot(target)
  }
  return { table: c.table, op: c.op, key: c.key || null, data: c.op === "delete" ? null : data, before }
}

/**
 * Save `toRec` with a copy of `fromRec`'s file (the source keeps its own copy). The storage
 * connection must stay open until the save, because PocketBase reads the file lazily then.
 */
function saveWithFileFrom(app, toRec, toField, fromRec, fromField) {
  const fsys = app.newFilesystem()
  try {
    toRec.set(toField, fsys.getReuploadableFile(fromRec.baseFilesPath() + "/" + fromRec.getString(fromField), true))
    app.save(toRec)
  } finally {
    fsys.close()
  }
}

/** Apply one change. `author` is who suggested it (only their own pending uploads may be used). */
function applyChange(app, treeId, c, author) {
  const collection = app.findCollectionByNameOrId(c.table)
  const data = c.data || {}
  if (c.op === "insert") {
    const rec = new Record(collection)
    const values = Object.assign({}, DEFAULTS[c.table] || {}, data)
    if (c.table !== "family_children") values.tree = treeId
    else {
      const fam = findOrNull(app, "families", String(values.family || ""))
      if (!fam || fam.getString("tree") !== treeId) fail(MSG.gone)
    }
    for (const k of Object.keys(values)) {
      if (k === "upload" || k === "created_at" || k === "updated_at" || k === "file") continue
      rec.set(k, values[k])
    }
    if (c.table === "media") {
      const upload = usableUpload(app, data.upload, author)
      saveWithFileFrom(app, rec, "file", upload, "file")
      app.delete(upload)
    } else {
      app.save(rec)
    }
    return
  }
  const rec = findTarget(app, c.table, c.key, treeId)
  if (!rec) fail(MSG.gone)
  if (c.op === "update") {
    let changed = false
    for (const k of Object.keys(data)) {
      if (FIXED.includes(k) || k === "file" || k === "upload") continue
      rec.set(k, data[k])
      changed = true
    }
    if (changed) app.save(rec)
  } else {
    app.delete(rec)
  }
}

/** Errors from PocketBase's own validation, in words a relative or Jason can act on. */
function explain(err) {
  if (err instanceof BadRequestError || (err && err.status === 400 && err.message && !err.data)) return err
  const text = String((err && (err.value && err.value.error ? err.value.error() : err.message)) || err)
  if (/relation|not found|no rows/i.test(text)) {
    return new BadRequestError("This change depends on a person, family or photo that isn't in the tree (yet). If it builds on another waiting change, approve that one first.")
  }
  return new BadRequestError("This change couldn't be applied: " + text)
}

/** Apply a stored request inside the caller's transaction and mark it approved. */
function applyRequest(app, req, reviewer) {
  const store = $app.store()
  store.set("sft_request", req.id)
  store.set("sft_actor", reviewer.id)
  try {
    const author = findOrNull(app, "users", req.getString("author"))
    for (const c of json(req, "changes") || []) {
      try { applyChange(app, req.getString("tree"), c, author) } catch (err) { throw explain(err) }
    }
  } finally {
    store.remove("sft_request")
    store.remove("sft_actor")
  }
  req.set("status", "approved")
  req.set("reviewed_by", reviewer.id)
  req.set("reviewed_at", new DateTime())
  app.save(req)
}

/** Delete the pending uploads a request referred to (when it's declined or withdrawn). */
function dropUploads(app, req) {
  for (const c of json(req, "changes") || []) {
    if (c.table !== "media" || c.op !== "insert" || !c.data || !c.data.upload) continue
    const up = findOrNull(app, "uploads", String(c.data.upload))
    if (up && up.getString("purpose") === "pending") app.delete(up)
  }
}

/** Write one change_log row (called from the record hooks in change_log.pb.js). */
function log(app, table, op, rec, before, after) {
  const store = $app.store()
  const row = new Record(app.findCollectionByNameOrId("change_log"))
  const reqId = store.get("sft_request")
  const actor = store.get("sft_actor")
  if (reqId) row.set("request", reqId)
  if (actor) row.set("actor", actor)
  const next = new DynamicModel({ n: 0 })
  app.db().newQuery("SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM change_log").one(next)
  row.set("seq", next.n)
  row.set("table_name", table)
  row.set("op", op)
  row.set("row_key", { id: rec.id })
  row.set("before", before)
  row.set("after", after)
  app.save(row)
}

/** Keep a copy of a photo that's being deleted, so undo can bring the file back. */
function trashMediaFile(app, rec) {
  if (!rec.getString("file")) return
  try {
    const up = new Record(app.findCollectionByNameOrId("uploads"))
    up.set("purpose", "trash")
    up.set("media_id", rec.id)
    up.set("tree", rec.getString("tree"))
    saveWithFileFrom(app, up, "file", rec, "file")
  } catch (err) {
    console.log("sft: couldn't keep a copy of deleted photo", rec.id, String(err))
  }
}

/** Undo an approved request: put every row it touched back the way it was (cascades included). */
function revertRequest(app, req, admin) {
  const store = $app.store()
  store.set("sft_actor", admin.id) // undo itself is logged, without a request
  try {
    const logs = app.findRecordsByFilter("change_log", "request = {:r}", "seq", 0, 0, { r: req.id })
    const rank = (l) => PARENT_FIRST.indexOf(l.getString("table_name"))
    const byKey = (l) => findOrNull(app, l.getString("table_name"), (json(l, "row_key") || {}).id || "")

    // 1. Remove rows the request created, children before parents, newest first.
    logs.filter((l) => l.getString("op") === "insert")
      .sort((a, b) => rank(b) - rank(a) || b.getInt("seq") - a.getInt("seq"))
      .forEach((l) => { const r = byKey(l); if (r) app.delete(r) })

    // 2. Bring back rows it deleted, parents before children. Links to rows that aren't back yet wait for step 4.
    const later = []
    logs.filter((l) => l.getString("op") === "delete")
      .sort((a, b) => rank(a) - rank(b) || a.getInt("seq") - b.getInt("seq"))
      .forEach((l) => {
        const table = l.getString("table_name")
        const before = json(l, "before") || {}
        if (findOrNull(app, table, before.id)) return
        const collection = app.findCollectionByNameOrId(table)
        const rec = new Record(collection)
        for (const k of Object.keys(before)) {
          const field = collection.fields.getByName(k)
          if (!field || k === "file") continue
          const v = before[k]
          if (field.type() === "autodate") { if (v) rec.setRaw(k, new DateTime(v)) }
          else if (field.type() === "relation" && v && !findOrNull(app, field.collectionId, v)) later.push([table, before.id, k, v])
          else rec.set(k, v)
        }
        if (table === "media") {
          const kept = app.findRecordsByFilter("uploads", "purpose = 'trash' && media_id = {:m}", "-created_at", 1, 0, { m: before.id })
          if (!kept.length) fail("The file for a deleted photo is no longer kept, so this change can't be undone.")
          saveWithFileFrom(app, rec, "file", kept[0], "file")
          app.delete(kept[0])
        } else {
          app.save(rec)
        }
      })

    // 3. Restore values it overwrote, newest first so the oldest "before" wins.
    logs.filter((l) => l.getString("op") === "update")
      .sort((a, b) => b.getInt("seq") - a.getInt("seq"))
      .forEach((l) => {
        const rec = byKey(l)
        if (!rec) return
        const before = json(l, "before") || {}
        for (const k of Object.keys(before)) {
          const field = rec.collection().fields.getByName(k)
          if (!field || k === "file" || FIXED.includes(k) || field.type() === "autodate") continue
          const v = before[k]
          if (field.type() === "relation" && v && !findOrNull(app, field.collectionId, v)) { later.push([rec.collection().name, rec.id, k, v]); continue }
          rec.set(k, v)
        }
        app.save(rec)
      })

    // 4. Links that had to wait for their target to come back.
    for (const [table, id, field, value] of later) {
      const rec = findOrNull(app, table, id)
      const target = findOrNull(app, rec ? rec.collection().fields.getByName(field).collectionId : "", value)
      if (rec && target) { rec.set(field, value); app.save(rec) }
    }
  } finally {
    store.remove("sft_actor")
  }
  req.set("status", "reverted")
  req.set("reviewed_by", admin.id)
  req.set("reviewed_at", new DateTime())
  app.save(req)
}

module.exports = {
  EDITABLE, MSG, fail, isApproved, isAdmin, canEdit, json, snapshot, findOrNull,
  prepareChange, applyRequest, dropUploads, revertRequest, log, trashMediaFile,
}
