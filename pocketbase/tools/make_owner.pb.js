/// <reference path="../pb_data/types.d.ts" />
// Make a signed-up account the site's admin and the owner of every tree, and (optionally)
// link it to its own person entry. Used once, at the switchover from Supabase.
//
//   pocketbase make-owner <email> [personId] --dir=<pb_data> --hooksDir=<folder holding only this file>
//
// The account must have confirmed its email first (that proves the address is real).

$app.rootCmd.addCommand(new Command({
  use: "make-owner",
  short: "Make an account the admin and tree owner",
  run: (cmd, args) => {
    const [email, personId] = args
    if (!email) throw new Error("usage: make-owner <email> [personId]")

    try { $app.runInTransaction((txApp) => {
      const user = txApp.findAuthRecordByEmail("users", email)
      if (!user.getBool("verified")) throw new Error(`${email} hasn't confirmed their email yet`)

      user.set("status", "approved")
      user.set("role", "admin")
      user.set("reviewed_at", new DateTime())
      if (personId) {
        const person = txApp.findRecordById("people", personId)
        const others = txApp.findAllRecords("users", $dbx.exp("person = {:p} AND id != {:u}", { p: person.id, u: user.id }))
        if (others.length) throw new Error(`${person.getString("given_names")} is already linked to another account`)
        user.set("person", person.id)
        user.set("person_status", "approved")
      }
      txApp.save(user)

      for (const tree of txApp.findAllRecords("trees")) {
        tree.set("owner", user.id)
        txApp.save(tree)
        let member
        try {
          member = txApp.findFirstRecordByFilter("tree_members", "tree = {:t} && user = {:u}", { t: tree.id, u: user.id })
        } catch (_) {
          member = new Record(txApp.findCollectionByNameOrId("tree_members"))
          member.set("tree", tree.id)
          member.set("user", user.id)
        }
        member.set("role", "owner")
        txApp.save(member)
        console.log(`owner of "${tree.getString("name")}"`)
      }
      console.log(`${email}: approved admin${personId ? ", linked to person " + personId : ""}`)
    }) } catch (err) {
      console.log("Not done, nothing was changed:", String(err).replace(/^Error: /, ""))
    }
  },
}))
