/// <reference path="../pb_data/types.d.ts" />
// Make the small copies of photos ahead of time, so nobody waits while the server makes them
// on first view (95 book scans took the Pi ~20 seconds).
//
//   pocketbase make-thumbs --dir=<pb_data> --hooksDir=<folder holding only this file>
//
// Makes 480x0 (galleries, the profile card) for every media file, and 160x160 (the map,
// avatars) for every portrait. Skips any that already exist, so it's safe to run again.

$app.rootCmd.addCommand(new Command({
  use: "make-thumbs",
  short: "Pre-generate photo thumbnails",
  run: (cmd, args) => {
    const portraits = {}
    for (const p of $app.findAllRecords("people")) if (p.getString("photo")) portraits[p.getString("photo")] = true
    const fsys = $app.newFilesystem()
    let made = 0, had = 0, skipped = 0, failed = 0
    try {
      for (const m of $app.findAllRecords("media")) {
        const name = m.getString("file")
        if (!name || !/\.(jpe?g|png|webp|gif)$/i.test(name)) { skipped++; continue }
        const base = m.baseFilesPath()
        const sizes = portraits[m.id] ? ["480x0", "160x160"] : ["480x0"]
        for (const size of sizes) {
          const thumbKey = `${base}/thumbs_${name}/${size}_${name}`
          try {
            if (fsys.exists(thumbKey)) { had++; continue }
            fsys.createThumb(`${base}/${name}`, thumbKey, size)
            made++
          } catch (err) {
            failed++
            console.log("couldn't make", size, "for media", m.id, String(err))
          }
        }
      }
    } finally {
      fsys.close()
    }
    console.log(`thumbnails: ${made} made, ${had} already there, ${skipped} not images, ${failed} failed`)
  },
}))
