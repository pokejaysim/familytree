/// <reference path="../pb_data/types.d.ts" />
// The welcome video plays once per member, on their first sign-in, whichever device that's on.
// welcomed_at is set by POST /api/sft/welcomed (pb_hooks/accounts.pb.js), for the signed-in member only.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new DateField({ name: "welcomed_at" }))
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("welcomed_at")
  app.save(users)
})
