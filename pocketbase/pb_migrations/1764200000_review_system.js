/// <reference path="../pb_data/types.d.ts" />
// Phase 2: what the review system (pb_hooks) needs on top of the base schema.
//
// - uploads: a holding area for files. "pending" = a contributor's photo waiting for review
//   (moved into media when approved, deleted when declined or withdrawn). "trash" = a copy of a
//   deleted photo, so undoing that deletion brings the file back too.
// - change_log.seq: strict order of logged changes, so undo replays them exactly.
// - change_requests.subject_person becomes plain text: it may name a person the request creates.
// - users: anyone may sign up (a hook makes every new account pending and view-only), and
//   only confirmed email addresses can sign in.

const APPROVED = '@request.auth.collectionName = "users" && @request.auth.status = "approved"'
const ADMIN = APPROVED + ' && @request.auth.role = "admin"'
const CAN_EDIT = APPROVED + ' && (@request.auth.role = "editor" || @request.auth.role = "admin")'

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  const trees = app.findCollectionByNameOrId("trees")

  const uploads = new Collection({
    type: "base",
    name: "uploads",
    // The uploader sees their own uploads; the admin sees all. Only hooks change or delete them.
    listRule: 'owner = @request.auth.id || (' + ADMIN + ')',
    viewRule: 'owner = @request.auth.id || (' + ADMIN + ')',
    createRule: CAN_EDIT,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "id", type: "text", system: true, primaryKey: true, required: true, min: 15, max: 36, pattern: "^[a-z0-9-]+$", autogeneratePattern: "[a-z0-9]{15}" },
      { name: "tree", type: "relation", collectionId: trees.id, maxSelect: 1, cascadeDelete: true },
      { name: "owner", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { name: "purpose", type: "select", values: ["pending", "trash"], maxSelect: 1, required: true },
      { name: "media_id", type: "text", max: 36 },
      {
        name: "file", type: "file", required: true, protected: true, maxSelect: 1,
        maxSize: 25 * 1024 * 1024,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf"],
        thumbs: ["160x160", "480x0", "1200x0"],
      },
      { name: "created_at", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: [
      "CREATE INDEX idx_uploads_purpose ON uploads (purpose, created_at)",
      "CREATE INDEX idx_uploads_media ON uploads (media_id)",
    ],
  })
  app.save(uploads)

  const log = app.findCollectionByNameOrId("change_log")
  log.fields.add(new NumberField({ name: "seq", onlyInt: true }))
  log.indexes.push("CREATE INDEX idx_change_log_seq ON change_log (request, seq)")
  app.save(log)

  const requests = app.findCollectionByNameOrId("change_requests")
  requests.fields.removeByName("subject_person")
  requests.indexes = requests.indexes.filter((i) => !i.includes("idx_change_requests_subject"))
  app.save(requests)
  requests.fields.add(new TextField({ name: "subject_person", max: 36 }))
  requests.indexes.push("CREATE INDEX idx_change_requests_subject ON change_requests (subject_person)")
  app.save(requests)

  users.createRule = ""
  users.authRule = "verified = true"
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.createRule = null
  users.authRule = ""
  app.save(users)

  const requests = app.findCollectionByNameOrId("change_requests")
  requests.fields.removeByName("subject_person")
  requests.indexes = requests.indexes.filter((i) => !i.includes("idx_change_requests_subject"))
  app.save(requests)
  requests.fields.add(new RelationField({ name: "subject_person", collectionId: app.findCollectionByNameOrId("people").id, maxSelect: 1 }))
  requests.indexes.push("CREATE INDEX idx_change_requests_subject ON change_requests (subject_person)")
  app.save(requests)

  const log = app.findCollectionByNameOrId("change_log")
  log.fields.removeByName("seq")
  log.indexes = log.indexes.filter((i) => !i.includes("idx_change_log_seq"))
  app.save(log)

  app.delete(app.findCollectionByNameOrId("uploads"))
})
