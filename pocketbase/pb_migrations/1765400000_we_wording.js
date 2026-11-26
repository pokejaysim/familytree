/// <reference path="../pb_data/types.d.ts" />
// The site speaks as "we" rather than naming Jason (2026-11-26, at his request). The password-reset
// and confirm-email messages were signed "Jason"; they're now signed "The {APP_NAME}". (The
// "You're in" and family news emails live in pb_hooks and say the same.)

const page = (paragraphs) => paragraphs.map((p) => `<p>${p}</p>`).join("\n")

const reset = (sign) => page([
  "Hello,",
  "Someone asked to reset the password for your {APP_NAME} account. If it was you, choose a new one here:",
  '<a class="btn" href="{APP_URL}/?reset={TOKEN}" target="_blank" rel="noopener">Choose a new password</a>',
  "The link works for 24 hours.",
  "If you didn't ask for this, you can ignore this email. Your password stays the same.",
  sign,
])

const confirm = (approval, sign) => page([
  "Hello,",
  "Thanks for joining the {APP_NAME}. Please confirm this is your email address:",
  '<a class="btn" href="{APP_URL}/?confirm={TOKEN}" target="_blank" rel="noopener">Confirm my email</a>',
  approval,
  "If you didn't sign up, you can ignore this email.",
  sign,
])

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.resetPasswordTemplate.body = reset("The {APP_NAME}")
  users.verificationTemplate.body = confirm("Once your account has been approved, you can explore the family.", "The {APP_NAME}")
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.resetPasswordTemplate.body = reset("Jason")
  users.verificationTemplate.body = confirm("Once Jason has approved your account, you can sign in and explore the family.", "Jason")
  app.save(users)
})
