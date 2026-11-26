/// <reference path="../pb_data/types.d.ts" />
// Family news (2026-11-26): posts on the site's News page that an admin can also email to every member.
//
// - news: a title, the words, an optional photo. Approved members read; only admins write.
//   Who it was emailed to (sent_to) and whose email failed (failed_to, tried again on the next send)
//   are hidden from everyone but the server; emailed_count is the tally.
// - users.news_emails_off: the member asked not to get the emails (News page switch, or the link in an email).
// - users.unsub_key: a random key for each member's "stop these emails" link, so it works without
//   signing in. Hidden from the API. Existing members get one here; new ones get one when they sign up.
// The sending is in pb_hooks/news.pb.js.

const APPROVED = '@request.auth.collectionName = "users" && @request.auth.status = "approved"'
const ADMIN = APPROVED + ' && @request.auth.role = "admin"'

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new BoolField({ name: "news_emails_off" }))
  users.fields.add(new TextField({ name: "unsub_key", hidden: true, max: 64, autogeneratePattern: "[a-z0-9]{24}" }))
  app.save(users)
  app.db().newQuery("UPDATE users SET unsub_key = lower(hex(randomblob(12))) WHERE unsub_key = '' OR unsub_key IS NULL").execute()

  const news = new Collection({
    type: "base",
    name: "news",
    listRule: APPROVED, viewRule: APPROVED, createRule: ADMIN, updateRule: ADMIN, deleteRule: ADMIN,
    fields: [
      { name: "title", type: "text", required: true, max: 200, presentable: true },
      { name: "body", type: "text", max: 20000 },
      {
        name: "photo", type: "file", maxSelect: 1, maxSize: 15 * 1024 * 1024, protected: true,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"], thumbs: ["480x0", "1200x0"],
      },
      { name: "author", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "emailed_at", type: "date" },
      { name: "emailed_count", type: "number", onlyInt: true, min: 0 },
      { name: "sent_to", type: "json", hidden: true, maxSize: 200000 },
      { name: "failed_to", type: "json", hidden: true, maxSize: 200000 },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE INDEX idx_news_created ON news (created)"],
  })
  app.save(news)
}, (app) => {
  app.delete(app.findCollectionByNameOrId("news"))
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("news_emails_off")
  users.fields.removeByName("unsub_key")
  app.save(users)
})
