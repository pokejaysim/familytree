/// <reference path="../pb_data/types.d.ts" />
// "Continue with Google" on the sign-in page. An admin switches it on from the Admin page by pasting
// the two codes Google gives them (a client ID and a client secret). The secret is never sent back.
//
// Signing in with Google is PocketBase's own OAuth2 sign-in, nothing custom:
// - A new account made by Google goes through the same create hook as the sign-up form
//   (accounts.pb.js), so it waits for approval as a view-only account and the admins get the
//   same email. Whatever else the browser sends with it is overwritten there.
// - Someone whose Google address matches an existing account lands in that account. If that account
//   never had its email confirmed, PocketBase also gives it a new random password (so nobody who
//   signed up with someone else's address keeps a way in), and from then on that person uses Google
//   or "Forgot password?".
// - Google sends people back to the site itself (simfamilytree.com/), not to this server, so that's
//   the address Google's screen shows. The site then finishes the sign-in here.
//
//   GET    /api/sft/google   → {on, clientId}            admins only
//   POST   /api/sft/google   {clientId, clientSecret}    admins only: switch on, or replace the codes
//   DELETE /api/sft/google                               admins only: switch off

routerAdd("GET", "/api/sft/google", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  if (!lib.isAdmin(e.auth)) throw new ForbiddenError("Only admins can see this.")
  const users = $app.findCollectionByNameOrId("users")
  const g = users.oauth2.providers.find((p) => p.name === "google")
  return e.json(200, { on: !!(users.oauth2.enabled && g && g.clientId), clientId: g ? g.clientId : "" })
}, $apis.requireAuth("users"))

routerAdd("POST", "/api/sft/google", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  if (!lib.isAdmin(e.auth)) throw new ForbiddenError("Only admins can change sign-in settings.")
  const body = e.requestInfo().body || {}
  const clientId = String(body.clientId || "").trim()
  const clientSecret = String(body.clientSecret || "").trim()
  if (!/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId)) {
    lib.fail("That doesn’t look like a Google client ID. It ends in .apps.googleusercontent.com.")
  }
  if (!/^[\x21-\x7e]{10,200}$/.test(clientSecret)) lib.fail("That doesn’t look like a Google client secret. Copy it again from Google.")
  const users = $app.findCollectionByNameOrId("users")
  unmarshal({ oauth2: { enabled: true, mappedFields: { name: "name" }, providers: [{ name: "google", clientId, clientSecret }] } }, users)
  $app.save(users)
  $app.logger().info("sft: Google sign-in switched on", "by", e.auth.id)
  return e.json(200, { on: true, clientId })
}, $apis.requireAuth("users"))

routerAdd("DELETE", "/api/sft/google", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  if (!lib.isAdmin(e.auth)) throw new ForbiddenError("Only admins can change sign-in settings.")
  const users = $app.findCollectionByNameOrId("users")
  unmarshal({ oauth2: { enabled: false, providers: [] } }, users)
  $app.save(users)
  $app.logger().info("sft: Google sign-in switched off", "by", e.auth.id)
  return e.json(200, { on: false, clientId: "" })
}, $apis.requireAuth("users"))
