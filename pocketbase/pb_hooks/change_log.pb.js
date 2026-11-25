/// <reference path="../pb_data/types.d.ts" />
// The safety net: every change to the family records goes into change_log, whether it comes
// from an approved request, a cascade (deleting a person also deletes their events, and so on),
// an undo, or the admin dashboard. These "execute" hooks run inside the same transaction as
// the change itself, so the log can never disagree with the data.
//
// A deleted photo's file is kept in uploads ("trash") first, so undo can bring it back.

onRecordCreateExecute((e) => {
  e.next()
  const lib = require(`${__hooks}/sft_lib.js`)
  lib.log(e.app, e.record.collection().name, "insert", e.record, null, lib.snapshot(e.record))
}, "people", "families", "family_children", "events", "citations", "sources", "media")

onRecordUpdateExecute((e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  const before = lib.snapshot(e.record.original())
  e.next()
  lib.log(e.app, e.record.collection().name, "update", e.record, before, lib.snapshot(e.record))
}, "people", "families", "family_children", "events", "citations", "sources", "media")

onRecordDeleteExecute((e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  const before = lib.snapshot(e.record)
  if (e.record.collection().name === "media") lib.trashMediaFile(e.app, e.record)
  e.next()
  lib.log(e.app, e.record.collection().name, "delete", e.record, before, null)
}, "people", "families", "family_children", "events", "citations", "sources", "media")
