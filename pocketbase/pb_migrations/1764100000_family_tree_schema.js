/// <reference path="../pb_data/types.d.ts" />
// Family tree schema for PocketBase, mirroring the Supabase tables (see supabase/migrations).
//
// - Collection and field names match the Supabase columns, minus the "_id" suffix on links
//   (people.tree_id -> people.tree), so the app's data layer changes as little as possible.
// - Records keep their Supabase UUIDs as IDs, so every link and every URL stays the same.
//   New records may use a client-made UUID or PocketBase's own 15-character ID.
// - Access matches Supabase: approved members can read; only an approved admin can write.
//   Everyone else's edits go through the review routes in pb_hooks, never straight in.
// - A person's portrait is a link to one of their media records (Supabase stored the path twice).

const APPROVED = '@request.auth.collectionName = "users" && @request.auth.status = "approved"'
const ADMIN = APPROVED + ' && @request.auth.role = "admin"'
const READ_MEMBERS_WRITE_ADMIN = { listRule: APPROVED, viewRule: APPROVED, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN }
const LONG = 100000
const JSON_MAX = 2000000

const text = (name, max = 1000, extra = {}) => ({ name, type: "text", max, ...extra })
const date = (name) => ({ name, type: "date" })
const created = () => ({ name: "created_at", type: "autodate", onCreate: true, onUpdate: false })
const link = (name, collectionId, extra = {}) => ({ name, type: "relation", collectionId, maxSelect: 1, cascadeDelete: false, ...extra })
const select = (name, values, extra = {}) => ({ name, type: "select", values, maxSelect: 1, ...extra })

/** The record ID: PocketBase's usual 15-character IDs, but also the existing 36-character UUIDs. */
const uuidFriendlyId = () => ({
  name: "id", type: "text", system: true, primaryKey: true, required: true,
  min: 15, max: 36, pattern: "^[a-z0-9-]+$", autogeneratePattern: "[a-z0-9]{15}",
})

function create(app, def) {
  const c = new Collection({ type: "base", ...READ_MEMBERS_WRITE_ADMIN, ...def, fields: [uuidFriendlyId(), ...def.fields] })
  app.save(c)
  return c
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")

  const trees = create(app, {
    name: "trees",
    fields: [
      text("name", 500, { required: true, presentable: true }),
      text("description", LONG),
      link("owner", users.id),
      text("intro_title", 500), text("intro", LONG), text("intro_byline", 500),
      text("foreword_title", 500), text("foreword", LONG), text("foreword_byline", 500),
      created(),
    ],
  })
  const inTree = () => link("tree", trees.id, { required: true, cascadeDelete: true })

  const people = create(app, {
    name: "people",
    fields: [
      inTree(),
      text("given_names", 500, { presentable: true }),
      text("surname", 500, { presentable: true }),
      text("maiden_name", 500), text("nickname", 500),
      select("sex", ["M", "F", "X", "U"]),
      text("birth_date", 200), date("birth_date_sort"), text("birth_place", 1000),
      text("death_date", 200), date("death_date_sort"), text("death_place", 1000),
      { name: "is_living", type: "bool" },
      text("bio", LONG),
      created(),
      { name: "updated_at", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_people_tree ON people (tree)",
      "CREATE INDEX idx_people_name ON people (tree, surname, given_names)",
    ],
  })

  const families = create(app, {
    name: "families",
    fields: [
      inTree(),
      link("partner1", people.id), link("partner2", people.id),
      select("union_type", ["marriage", "partnership", "unknown"]),
      text("start_date", 200), date("start_date_sort"), text("start_place", 1000),
      text("end_date", 200), date("end_date_sort"),
      text("notes", LONG),
      created(),
    ],
    indexes: [
      "CREATE INDEX idx_families_tree ON families (tree)",
      "CREATE INDEX idx_families_p1 ON families (partner1)",
      "CREATE INDEX idx_families_p2 ON families (partner2)",
    ],
  })

  create(app, {
    name: "family_children",
    fields: [
      link("family", families.id, { required: true, cascadeDelete: true }),
      link("person", people.id, { required: true, cascadeDelete: true }),
      select("relation", ["biological", "adopted", "step", "foster", "unknown"]),
      { name: "sort_order", type: "number", onlyInt: true },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_family_children_pair ON family_children (family, person)",
      "CREATE INDEX idx_family_children_person ON family_children (person)",
    ],
  })

  const sources = create(app, {
    name: "sources",
    fields: [
      inTree(),
      text("title", 1000, { required: true, presentable: true }),
      text("author", 500), text("publication", 1000), text("repository", 1000), text("url", 2000),
      text("notes", LONG),
      created(),
    ],
    indexes: ["CREATE INDEX idx_sources_tree ON sources (tree)"],
  })

  const events = create(app, {
    name: "events",
    fields: [
      inTree(),
      link("person", people.id, { cascadeDelete: true }),
      link("family", families.id, { cascadeDelete: true }),
      text("type", 100, { required: true, presentable: true }),
      text("date_text", 200), date("date_sort"), text("place", 1000),
      text("description", LONG),
      created(),
    ],
    indexes: [
      "CREATE INDEX idx_events_person ON events (person)",
      "CREATE INDEX idx_events_family ON events (family)",
    ],
  })

  create(app, {
    name: "citations",
    fields: [
      inTree(),
      link("source", sources.id, { required: true, cascadeDelete: true }),
      link("person", people.id, { cascadeDelete: true }),
      link("family", families.id, { cascadeDelete: true }),
      link("event", events.id, { cascadeDelete: true }),
      text("page", 500), text("quote", LONG),
      { name: "confidence", type: "number", min: 0, max: 3, onlyInt: true },
      created(),
    ],
    indexes: [
      "CREATE INDEX idx_citations_source ON citations (source)",
      "CREATE INDEX idx_citations_person ON citations (person)",
    ],
  })

  const media = create(app, {
    name: "media",
    fields: [
      inTree(),
      link("person", people.id, { cascadeDelete: true }),
      link("source", sources.id, { cascadeDelete: true }),
      {
        name: "file", type: "file", required: true, protected: true, maxSelect: 1,
        maxSize: 25 * 1024 * 1024,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf"],
        thumbs: ["160x160", "480x0", "1200x0"],
      },
      text("storage_path", 1000), // the file's old Supabase path, kept during the move
      text("mime_type", 100),
      text("caption", LONG, { presentable: true }),
      text("date_text", 200),
      created(),
    ],
    indexes: [
      "CREATE INDEX idx_media_person ON media (person)",
      "CREATE INDEX idx_media_source ON media (source)",
    ],
  })

  // The portrait link has to wait until media exists (media also links back to people).
  people.fields.add(new RelationField({ name: "photo", collectionId: media.id, maxSelect: 1, cascadeDelete: false }))
  app.save(people)

  create(app, {
    name: "tree_members",
    listRule: APPROVED, viewRule: APPROVED, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      inTree(),
      link("user", users.id, { required: true, cascadeDelete: true }),
      select("role", ["owner", "editor", "viewer"]),
      created(),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_tree_members_pair ON tree_members (tree, user)"],
  })

  // Member details (Supabase "profiles") live on the user record itself.
  users.fields.add(new SelectField({ name: "status", values: ["pending", "approved", "declined"], maxSelect: 1 }))
  users.fields.add(new SelectField({ name: "role", values: ["admin", "editor", "viewer"], maxSelect: 1 }))
  users.fields.add(new TextField({ name: "note", max: 2000 }))
  users.fields.add(new RelationField({ name: "person", collectionId: people.id, maxSelect: 1, cascadeDelete: false }))
  users.fields.add(new SelectField({ name: "person_status", values: ["pending", "approved"], maxSelect: 1 }))
  users.fields.add(new DateField({ name: "reviewed_at" }))
  users.fields.add(new RelationField({ name: "reviewed_by", collectionId: users.id, maxSelect: 1, cascadeDelete: false }))
  users.indexes.push("CREATE UNIQUE INDEX idx_users_person_approved ON users (person) WHERE person_status = 'approved'")
  users.indexes.push("CREATE INDEX idx_users_status ON users (status)")
  // You can see your own account; the admin sees everyone. You can't change your own
  // status, role or "This is me" link; only the admin can. Sign-ups open in phase 2,
  // together with the hook that makes every new account pending and view-only.
  const SELF_SAFE = 'id = @request.auth.id'
    + ' && @request.body.status:isset = false && @request.body.role:isset = false'
    + ' && @request.body.person:isset = false && @request.body.person_status:isset = false'
    + ' && @request.body.reviewed_at:isset = false && @request.body.reviewed_by:isset = false'
  users.listRule = 'id = @request.auth.id || (' + ADMIN + ')'
  users.viewRule = 'id = @request.auth.id || (' + ADMIN + ')'
  users.createRule = null
  users.updateRule = '(' + SELF_SAFE + ') || (' + ADMIN + ')'
  users.deleteRule = ADMIN
  app.save(users)

  const changeRequests = create(app, {
    name: "change_requests",
    // Members see their own suggestions; the admin sees all. Changes only happen through the review routes.
    listRule: 'author = @request.auth.id || (' + ADMIN + ')',
    viewRule: 'author = @request.auth.id || (' + ADMIN + ')',
    createRule: null, updateRule: null, deleteRule: null,
    fields: [
      inTree(),
      link("author", users.id),
      text("summary", 2000, { required: true, presentable: true }),
      link("subject_person", people.id),
      { name: "changes", type: "json", required: true, maxSize: JSON_MAX },
      select("status", ["pending", "approved", "rejected", "withdrawn", "reverted"], { required: true }),
      text("review_note", 5000),
      link("reviewed_by", users.id),
      date("reviewed_at"),
      created(),
    ],
    indexes: [
      "CREATE INDEX idx_change_requests_status ON change_requests (tree, status, created_at)",
      "CREATE INDEX idx_change_requests_subject ON change_requests (subject_person)",
    ],
  })

  create(app, {
    name: "change_log",
    listRule: ADMIN, viewRule: ADMIN, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      link("request", changeRequests.id),
      text("table_name", 100, { required: true }),
      text("op", 20, { required: true }),
      { name: "row_key", type: "json", maxSize: JSON_MAX },
      { name: "before", type: "json", maxSize: JSON_MAX },
      { name: "after", type: "json", maxSize: JSON_MAX },
      link("actor", users.id),
      { name: "at", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE INDEX idx_change_log_request ON change_log (request)"],
  })
}, (app) => {
  for (const name of ["change_log", "change_requests", "tree_members"]) {
    app.delete(app.findCollectionByNameOrId(name))
  }
  const users = app.findCollectionByNameOrId("users")
  for (const f of ["status", "role", "note", "person", "person_status", "reviewed_at", "reviewed_by"]) users.fields.removeByName(f)
  users.indexes = users.indexes.filter((i) => !i.includes("idx_users_person_approved") && !i.includes("idx_users_status"))
  users.listRule = "id = @request.auth.id"; users.viewRule = "id = @request.auth.id"
  users.createRule = ""; users.updateRule = "id = @request.auth.id"; users.deleteRule = "id = @request.auth.id"
  app.save(users)
  const people = app.findCollectionByNameOrId("people")
  people.fields.removeByName("photo")
  app.save(people)
  for (const name of ["media", "citations", "events", "sources", "family_children", "families", "people", "trees"]) {
    app.delete(app.findCollectionByNameOrId(name))
  }
})
