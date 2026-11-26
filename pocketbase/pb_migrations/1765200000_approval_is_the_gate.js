/// <reference path="../pb_data/types.d.ts" />
// Sign-up, simplified (2026-11-25). Relatives were getting stuck between two steps: confirming their
// email, and Jason's approval. Approval is the one that matters (every family record already needs an
// approved account), so it's now the only step:
// - anyone with the right email and password can sign in, confirmed or not. Until they're approved
//   they only see the "You're on the list" page;
// - no confirm-your-email message is sent at sign-up (pb_hooks/accounts.pb.js);
// - when Jason approves someone, they get a "You're in" email.

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.authRule = ""
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.authRule = "verified = true"
  app.save(users)
})
