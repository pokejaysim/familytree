/// <reference path="../pb_data/types.d.ts" />
// Ready for "Continue with Google" (pb_hooks/google.pb.js), which stays off until an admin pastes
// Google's codes on the Admin page:
//
// - A new account made by Google takes its name from the Google account.
// - Google sign-ins are limited like the sign-up form: 20 a minute from one internet address for
//   people who aren't signed in (plenty for a family sharing one Wi-Fi).

const RULE = { label: "*:authWithOAuth2", audience: "@guest", duration: 60, maxRequests: 20 }
const plain = (r) => ({ label: r.label, audience: r.audience, duration: r.duration, maxRequests: r.maxRequests })
const isRule = (r) => r.label === RULE.label && r.audience === RULE.audience

migrate((app) => {
  const s = app.settings()
  s.rateLimits.rules = [RULE, ...s.rateLimits.rules.map(plain).filter((r) => !isRule(r))]
  app.save(s)
  const users = app.findCollectionByNameOrId("users")
  unmarshal({ oauth2: { mappedFields: { name: "name" } } }, users)
  app.save(users)
}, (app) => {
  const s = app.settings()
  s.rateLimits.rules = s.rateLimits.rules.map(plain).filter((r) => !isRule(r))
  app.save(s)
  const users = app.findCollectionByNameOrId("users")
  unmarshal({ oauth2: { enabled: false, providers: [], mappedFields: { name: "" } } }, users)
  app.save(users)
})
