/// <reference path="../pb_data/types.d.ts" />
// Relatives often share one internet address (a home's Wi-Fi, a family gathering), and opening the
// map takes about 90 requests. The general limit was 300 requests per 10 seconds per address, so a
// few people opening the site together could be turned away. Raise it to 1,000. The sign-in and
// create limits stay as they are.

const setApiLimit = (app, max) => {
  const s = app.settings()
  s.rateLimits.rules = s.rateLimits.rules.map((r) => ({
    label: r.label, audience: r.audience, duration: r.duration,
    maxRequests: r.label === "/api/" ? max : r.maxRequests,
  }))
  app.save(s)
}

migrate((app) => setApiLimit(app, 1000), (app) => setApiLimit(app, 300))
