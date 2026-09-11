# Family Tree

Private family-tree app: people, relationships, an interactive pan/zoom chart, photos, and sources with citations.

## Setup
```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm run dev
```
Login is currently switched off (open-access mode): the site opens straight to the trees and anyone with the link can edit. Set `REQUIRE_LOGIN = true` in `src/App.tsx` and drop the `open-access:` policies to turn it back on.

## Live site
https://pokejaysim.github.io/familytree/ — deployed automatically by `.github/workflows/deploy.yml` on every push to `main`.
The two `VITE_*` values live in the repo's Actions variables. Supabase → Authentication → URL Configuration must list this URL as the Site URL so email confirmation links land on the live app.

See `CLAUDE.md` for architecture and data model.
