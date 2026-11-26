/// <reference path="../pb_data/types.d.ts" />
// Plainer wording in the confirm-email message (2026-11-26 language check): "explore the family" becomes
// "see the family tree". The site no longer asks anyone to confirm their email, so this only matters if
// someone asks PocketBase for the message directly.

const page = (paragraphs) => paragraphs.map((p) => `<p>${p}</p>`).join("\n")
const confirm = (approval) => page([
  "Hello,",
  "Thanks for joining the {APP_NAME}. Please confirm this is your email address:",
  '<a class="btn" href="{APP_URL}/?confirm={TOKEN}" target="_blank" rel="noopener">Confirm my email</a>',
  approval,
  "If you didn't sign up, you can ignore this email.",
  "The {APP_NAME}",
])

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.verificationTemplate.body = confirm("Once your account has been approved, you can see the family tree.")
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.verificationTemplate.body = confirm("Once your account has been approved, you can explore the family.")
  app.save(users)
})
