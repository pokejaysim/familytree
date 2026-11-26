/// <reference path="../pb_data/types.d.ts" />
// The server's own admin ("superuser") side is never available from the public internet.
//
// Everything public arrives through the Cloudflare tunnel, and Cloudflare stamps each request
// with Cf-Ray and Cf-Connecting-Ip headers (a visitor can't remove them). Requests over Tailscale,
// and commands run on the Pi itself, don't have them. So for anything that came through Cloudflare:
//
// - the dashboard (/_/) isn't served;
// - nothing under the superusers collection is reachable, however its name is spelled
//   (_superusers, _SUPERUSERS, or its id). The tunnel's own path rules only match one spelling;
// - a superuser sign-in token isn't accepted for anything.
//
// Members' requests are untouched.

routerUse((e) => {
  const h = e.request.header
  if (h.get("Cf-Ray") || h.get("Cf-Connecting-Ip")) {
    const path = String(e.request.url.path || "")
    if (/^\/+_(\/|$)/.test(path)) throw new NotFoundError()
    const m = path.match(/^\/+api\/+collections\/+([^/]+)/i)
    if (m) {
      let name = ""
      try { name = $app.findCachedCollectionByNameOrId(m[1]).name } catch (_) { /* no such collection */ }
      if (name === "_superusers" || m[1].toLowerCase() === "_superusers") throw new NotFoundError()
    }
    if (e.hasSuperuserAuth()) throw new NotFoundError()
  }
  return e.next()
})
