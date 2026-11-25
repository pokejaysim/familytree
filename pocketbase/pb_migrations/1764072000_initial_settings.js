/// <reference path="../pb_data/types.d.ts" />
// Starting settings: app name and nightly backups.
// The backup cron is in UTC: 10:45 UTC = 2:45 am PST / 3:45 am PDT. Keep the last 7.
migrate((app) => {
  const settings = app.settings()
  settings.meta.appName = "Sim Family Tree"
  settings.backups.cron = "45 10 * * *"
  settings.backups.cronMaxKeep = 7
  app.save(settings)
}, (app) => {
  const settings = app.settings()
  settings.backups.cron = ""
  app.save(settings)
})
