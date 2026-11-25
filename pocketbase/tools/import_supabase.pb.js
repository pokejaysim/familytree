/// <reference path="../pb_data/types.d.ts" />
// One-time import of a Supabase export (made by export_supabase.py) into PocketBase.
//
// Run it with a hooks folder that holds ONLY this file, so the review and change-log
// hooks don't treat the import as edits:
//
//   pocketbase import-supabase <exportDir> [replace] --dir=<pb_data> --hooksDir=<folder with only this file>
//
// "replace" first deletes the family records already in PocketBase (for a fresh re-import).
// The import itself is one transaction: if any row or file fails, none of it is kept.
// Accounts aren't imported; members sign up again (phase 2).

$app.rootCmd.addCommand(new Command({
  use: "import-supabase <exportDir> [replace]",
  short: "Import the family tree from a Supabase export",
  run: (cmd, args) => {
    // (PocketBase runs each handler in isolation, so everything it needs lives in here.)
    const dir = args[0]
    if (!dir) throw new Error("usage: import-supabase <exportDir> [replace]")
    const replace = args[1] === "replace"
    const load = (name) => JSON.parse(toString($os.readFile(dir + "/" + name + ".json")))
    const manifest = load("manifest")

    const ORDER = ["trees", "people", "families", "family_children", "sources", "events", "citations", "media"]
    const LINKS = { tree_id: "tree", person_id: "person", family_id: "family", source_id: "source", event_id: "event", partner1_id: "partner1", partner2_id: "partner2" }
    const LATER = { owner_id: true, photo_path: true } // owner: accounts come in phase 2; portraits: linked after media
    const AUTODATES = { created_at: true, updated_at: true }

    if (!replace && $app.countRecords("people") > 0) {
      throw new Error("PocketBase already has family records. Add 'replace' to wipe them and import again.")
    }

    if (replace) {
      // A separate, finished step: PocketBase removes a deleted record's files only after its
      // transaction commits, and the re-imported records reuse the same IDs (and file folders).
      $app.runInTransaction((txApp) => {
        for (const name of ORDER.slice().reverse()) {
          for (const r of txApp.findAllRecords(name)) txApp.delete(r)
        }
      })
      console.log("  removed the previous import")
    }

    $app.runInTransaction((txApp) => {
      for (const table of ORDER) {
        const collection = txApp.findCollectionByNameOrId(table)
        let n = 0
        for (const row of load(table)) {
          const rec = new Record(collection)
          for (const key of Object.keys(row)) {
            const value = row[key]
            if (value === null || value === undefined || LATER[key]) continue
            const field = key === "id" ? "id" : (LINKS[key] || key)
            if (!collection.fields.getByName(field)) throw new Error(table + ": no field for Supabase column " + key)
            if (AUTODATES[key]) rec.setRaw(field, new DateTime(value)) // keep the original timestamps
            else rec.set(field, value)
          }
          if (table === "media") rec.set("file", $filesystem.fileFromPath(dir + "/files/" + row.storage_path))
          txApp.save(rec)
          n++
        }
        if (n !== manifest.tables[table]) throw new Error(table + ": imported " + n + " but the export has " + manifest.tables[table])
        console.log("  " + table + ": " + n)
      }

      // Portraits: point each person at their media record. Plain SQL so "updated_at" isn't bumped.
      const mediaByPath = {}
      for (const m of load("media")) mediaByPath[m.storage_path] = m.id
      let portraits = 0
      for (const p of load("people")) {
        if (!p.photo_path) continue
        const mediaId = mediaByPath[p.photo_path]
        if (!mediaId) throw new Error("a portrait has no matching media record (person " + p.id + ")")
        txApp.db().newQuery("UPDATE people SET photo = {:photo} WHERE id = {:id}").bind({ photo: mediaId, id: p.id }).execute()
        portraits++
      }
      console.log("  portraits linked: " + portraits)
    })
    console.log("Import finished.")
  },
}))
