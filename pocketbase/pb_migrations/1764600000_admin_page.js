/// <reference path="../pb_data/types.d.ts" />
// The Admin page shows when each member last used the site.
// pb_hooks/accounts.pb.js fills last_seen in when someone signs in or the app checks their sign-in.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.add(new DateField({ name: "last_seen" }))
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.fields.removeByName("last_seen")
  app.save(users)
})
