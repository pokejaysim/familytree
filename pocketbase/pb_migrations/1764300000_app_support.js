/// <reference path="../pb_data/types.d.ts" />
// Phase 3: what the web app needs from the users collection.
//
// - The admin manages accounts, so the Members page can show members' email addresses.
// - Photo links (file tokens) last an hour, like Supabase's signed URLs did. The app
//   fetches one token and reuses it for every photo instead of signing each file.
// - The confirm-email and reset-password emails link to the family tree site
//   ({APP_URL}/?confirm=… and {APP_URL}/?reset=…), not to PocketBase's own pages.
//   APP_URL is the site's address, set under Settings → Application.

const ADMIN = '@request.auth.collectionName = "users" && @request.auth.status = "approved" && @request.auth.role = "admin"'

const page = (paragraphs) => paragraphs.map((p) => `<p>${p}</p>`).join("\n")

migrate((app) => {
  const users = app.findCollectionByNameOrId("users")
  users.manageRule = ADMIN
  users.fileToken.duration = 3600
  users.verificationTemplate.subject = "Confirm your email for the {APP_NAME}"
  users.verificationTemplate.body = page([
    "Hello,",
    "Thanks for joining the {APP_NAME}. Please confirm this is your email address:",
    '<a class="btn" href="{APP_URL}/?confirm={TOKEN}" target="_blank" rel="noopener">Confirm my email</a>',
    "Once Jason has approved your account, you can sign in and explore the family.",
    "If you didn't sign up, you can ignore this email.",
    "Jason",
  ])
  users.resetPasswordTemplate.subject = "Reset your {APP_NAME} password"
  users.resetPasswordTemplate.body = page([
    "Hello,",
    "Someone asked to reset the password for your {APP_NAME} account. If it was you, choose a new one here:",
    '<a class="btn" href="{APP_URL}/?reset={TOKEN}" target="_blank" rel="noopener">Choose a new password</a>',
    "If you didn't ask for this, you can ignore this email. Your password stays the same.",
    "Jason",
  ])
  app.save(users)
}, (app) => {
  const users = app.findCollectionByNameOrId("users")
  users.manageRule = null
  users.fileToken.duration = 180
  app.save(users)
})
