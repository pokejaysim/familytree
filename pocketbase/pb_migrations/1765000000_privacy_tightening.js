/// <reference path="../pb_data/types.d.ts" />
// Members only ever see their own account; admins see everyone. Two tightenings:
// - tree_members: was readable by every approved member (account ids and roles, no names). Now
//   members see only their own row and admins see all. The app doesn't list it for members.
// - users: members could edit last_seen and welcomed_at on their own account. Only the server sets
//   those now, so a member can't change what the Admin page shows about their visits.

const APPROVED = '@request.auth.collectionName = "users" && @request.auth.status = "approved"'
const ADMIN = APPROVED + ' && @request.auth.role = "admin"'
const SELF_FIELDS = ["status", "role", "person", "person_status", "reviewed_at", "reviewed_by"]
const selfRule = (fields) => "(id = @request.auth.id && " + fields.map((f) => `@request.body.${f}:isset = false`).join(" && ") + ") || (" + ADMIN + ")"

migrate((app) => {
  const members = app.findCollectionByNameOrId("tree_members")
  members.listRule = "user = @request.auth.id || (" + ADMIN + ")"
  members.viewRule = members.listRule
  app.save(members)
  const users = app.findCollectionByNameOrId("users")
  users.updateRule = selfRule([...SELF_FIELDS, "last_seen", "welcomed_at"])
  app.save(users)
}, (app) => {
  const members = app.findCollectionByNameOrId("tree_members")
  members.listRule = APPROVED
  members.viewRule = APPROVED
  app.save(members)
  const users = app.findCollectionByNameOrId("users")
  users.updateRule = selfRule(SELF_FIELDS)
  app.save(users)
})
