# Family Tree

Private family-tree app: people, relationships, an interactive pan/zoom chart, photos, and sources with citations.

## Setup
```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm run dev
```
Sign up with email + password, confirm the email, create a tree, add people.

## Live site
https://pokejaysim.github.io/familytree/ — deployed automatically by `.github/workflows/deploy.yml` on every push to `main`.
The two `VITE_*` values live in the repo's Actions variables. Supabase → Authentication → URL Configuration must list this URL as the Site URL so email confirmation links land on the live app.

See `CLAUDE.md` for architecture and data model.
