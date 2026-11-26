/// <reference path="../pb_data/types.d.ts" />
// Site health for the Admin page: backups, disk space, email and a few totals. Admins only.
// Nothing secret comes back (no email password or login). Every check is best effort: if one
// can't be read, that part is null and the page says it couldn't check.
//
// - Snapshots: the nightly zip that pocketbase-snapshot writes to the second drive (4:30 am).
// - Built-in backups: PocketBase's own nightly zip, kept on the same drive as the site.
// - Email problems: warnings from our hooks ("sft: couldn't …") and PocketBase's own
//   "Failed to send …" errors, from the request log of the last 30 days.

routerAdd("GET", "/api/sft/health", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  if (!lib.isAdmin(e.auth)) throw new ForbiddenError("Only admins can see site health.")
  const SNAPSHOTS = "/mnt/PiDrive1/_pocketbase-backups"
  const run = (...args) => { try { return toString($os.cmd(...args).output()) } catch (_) { return "" } }
  const iso = (t) => new Date(t.unix() * 1000).toISOString()

  // Newest file matching `re` in `dir`, by modification time.
  const newest = (dir, re) => {
    try {
      const files = $os.readDir(dir).map((d) => d.name()).filter((n) => re.test(n))
      if (!files.length) return { count: 0, at: null, bytes: 0 }
      const stats = files.map((n) => $os.stat(`${dir}/${n}`))
      stats.sort((a, b) => b.modTime().unix() - a.modTime().unix())
      return { count: files.length, at: iso(stats[0].modTime()), bytes: stats[0].size() }
    } catch (_) {
      return null
    }
  }
  const disk = (path) => {
    const line = run("df", "-kP", path).trim().split("\n")[1]
    if (!line) return null
    const p = line.split(/\s+/)
    return { total: Number(p[1]) * 1024, used: Number(p[2]) * 1024, free: Number(p[3]) * 1024 }
  }

  const snapshot = newest(SNAPSHOTS, /^pb_snapshot_\d+\.zip$/)
  const lastRun = run("systemctl", "show", "pocketbase-snapshot.service", "-p", "Result", "--value").trim()
  const settings = $app.settings()
  const builtIn = settings.backups.cron ? newest(`${$app.dataDir()}/backups`, /\.zip$/) : null
  const used = Number(run("du", "-sk", $app.dataDir()).split(/\s/)[0]) * 1024

  const since = new Date(Date.now() - 30 * 86400000).toISOString().replace("T", " ")
  const rows = arrayOf(new DynamicModel({ created: "", message: "" }))
  try {
    $app.auxDB().newQuery(
      "SELECT created, message FROM _logs WHERE created > {:t} AND (message LIKE 'sft: couldn''t%' OR message LIKE 'Failed to send%') ORDER BY created DESC LIMIT 10",
    ).bind({ t: since }).all(rows)
  } catch (_) { /* no log table yet */ }

  return e.json(200, {
    checkedAt: new Date().toISOString(),
    backups: {
      snapshot,
      snapshotLastRunFailed: !!lastRun && lastRun !== "success",
      builtIn: builtIn && { ...builtIn, keep: settings.backups.cronMaxKeep },
    },
    storage: { used: used || null, site: disk($app.dataDir()), backup: disk(SNAPSHOTS) },
    email: {
      ready: settings.smtp.enabled && !!settings.meta.senderAddress,
      from: settings.meta.senderAddress || null,
      problems: rows.map((r) => ({ at: String(r.created).replace(" ", "T"), message: r.message })),
    },
    totals: {
      people: $app.countRecords("people"),
      media: $app.countRecords("media"),
      sources: $app.countRecords("sources"),
      members: $app.countRecords("users", $dbx.exp("status = 'approved'")),
    },
  })
}, $apis.requireAuth("users"))

// "Send me a test email": proves the email settings work, without waiting for a sign-up.
routerAdd("POST", "/api/sft/test-email", (e) => {
  const lib = require(`${__hooks}/sft_lib.js`)
  if (!lib.isAdmin(e.auth)) throw new ForbiddenError("Only admins can send a test email.")
  const settings = $app.settings()
  if (!settings.smtp.enabled || !settings.meta.senderAddress) lib.fail("Email isn't set up on the server yet.")
  try {
    $app.newMailClient().send(new MailerMessage({
      from: { address: settings.meta.senderAddress, name: settings.meta.senderName },
      to: [{ address: e.auth.email(), name: e.auth.getString("name") }],
      subject: `Test email from the ${settings.meta.appName}`,
      text: "This is the test email you asked for on the Admin page. If you can read it, the family tree can send email, including sign-up notices, “You’re in” emails, password reset links and family news.",
    }))
  } catch (err) {
    $app.logger().warn("sft: couldn't send a test email", "error", String(err))
    lib.fail(`The server couldn't send it. The mail server said: ${String(err).replace(/^GoError:\s*/, "")}`)
  }
  return e.json(200, { ok: true, to: e.auth.email() })
}, $apis.requireAuth("users"))
