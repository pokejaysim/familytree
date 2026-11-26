/// <reference path="../pb_data/types.d.ts" />
// The family tree site moved to its own domain, https://simfamilytree.com (it was
// https://pokejaysim.github.io/familytree). Email links (confirm email, reset password,
// "someone signed up") now open the new address.

migrate((app) => {
  const s = app.settings()
  s.meta.appURL = "https://simfamilytree.com"
  app.save(s)
}, (app) => {
  const s = app.settings()
  s.meta.appURL = "https://pokejaysim.github.io/familytree"
  app.save(s)
})
