/// <reference path="../pb_data/types.d.ts" />
// Password-reset links last a day instead of 30 minutes, the same as the confirm-email links.
// Relatives often open the email hours after asking for it, and the short window locked them out.
// The email now says how long the link works.

const page = (paragraphs) => paragraphs.map((p) => `<p>${p}</p>`).join("\n")

const body = (extra) => page([
  "Hello,",
  "Someone asked to reset the password for your {APP_NAME} account. If it was you, choose a new one here:",
  '<a class="btn" href="{APP_URL}/?reset={TOKEN}" target="_blank" rel="noopener">Choose a new password</a>',
  ...extra,
  "If you didn't ask for this, you can ignore this email. Your password stays the same.",
  "Jason",
])

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.passwordResetToken.duration = 86400
  users.resetPasswordTemplate.body = body(["The link works for 24 hours."])
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.passwordResetToken.duration = 1800
  users.resetPasswordTemplate.body = body([])
  app.save(users)
})
