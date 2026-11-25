/// <reference path="../pb_data/types.d.ts" />
// Phase 4: settings for being reachable from the internet (through a Cloudflare tunnel).
//
// - Email links (confirm email, reset password) open the family tree site.
// - Visitors' real addresses come from Cloudflare's CF-Connecting-IP header. PocketBase only
//   listens on 127.0.0.1, so nobody outside can fake it; requests over Tailscale don't carry it
//   and fall back to the connection's address.
// - PocketBase's built-in rate limits are on: 2 sign-in attempts per 3 s, 20 creates per 5 s,
//   300 requests per 10 s per address. The map needs about 90 requests.

migrate((app) => {
  const s = app.settings()
  s.meta.appURL = "https://pokejaysim.github.io/familytree"
  s.trustedProxy.headers = ["CF-Connecting-IP"]
  s.trustedProxy.useLeftmostIP = false
  s.rateLimits.enabled = true
  app.save(s)
}, (app) => {
  const s = app.settings()
  s.meta.appURL = "http://localhost:8090"
  s.trustedProxy.headers = []
  s.rateLimits.enabled = false
  app.save(s)
})
