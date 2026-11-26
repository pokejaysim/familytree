/// <reference path="../pb_data/types.d.ts" />
// From the pre-launch security audit (2026-11-25):
//
// - Email limits. Signing up, "forgot password" and "send the confirmation again" each send an
//   email, and nothing limited how often one visitor could do them. Now, per internet address and
//   only for people who aren't signed in: 5 sign-ups an hour, and 5 of each email request per
//   15 minutes. (The admin's "Send password reset link" buttons are signed in, so they're not limited.)
// - The unused profile picture field no longer accepts SVG files, is capped at 5 MB, and needs
//   a sign-in to view.

const NEW_RULES = [
  { label: "users:create", audience: "@guest", duration: 3600, maxRequests: 5 },
  { label: "*:requestPasswordReset", audience: "@guest", duration: 900, maxRequests: 5 },
  { label: "*:requestVerification", audience: "@guest", duration: 900, maxRequests: 5 },
]
const plain = (r) => ({ label: r.label, audience: r.audience, duration: r.duration, maxRequests: r.maxRequests })
const isNew = (r) => NEW_RULES.some((n) => n.label === r.label && n.audience === r.audience)

migrate((app) => {
  const s = app.settings()
  s.rateLimits.rules = [...NEW_RULES, ...s.rateLimits.rules.map(plain).filter((r) => !isNew(r))]
  app.save(s)
  const users = app.findCollectionByNameOrId("users")
  const avatar = users.fields.getByName("avatar")
  if (avatar) {
    avatar.mimeTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    avatar.maxSize = 5242880
    avatar.protected = true
    app.save(users)
  }
}, (app) => {
  const s = app.settings()
  s.rateLimits.rules = s.rateLimits.rules.map(plain).filter((r) => !isNew(r))
  app.save(s)
  const users = app.findCollectionByNameOrId("users")
  const avatar = users.fields.getByName("avatar")
  if (avatar) {
    avatar.mimeTypes = ["image/jpeg", "image/png", "image/svg+xml", "image/gif", "image/webp"]
    avatar.maxSize = 0
    avatar.protected = false
    app.save(users)
  }
})
