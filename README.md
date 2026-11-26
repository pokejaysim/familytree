# Sim Family Tree

Private family-tree app: people, relationships, an interactive pan/zoom chart, photos, and sources with citations.

## Setup
```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm run dev
```
Family members ask to join on the login page, with email and password or (once an admin switches it on) Continue with Google. Nobody sees the tree until an admin approves them on the Admin page; approved members are viewers unless promoted to editor. Locally, add `VITE_DEV_EMAIL` and `VITE_DEV_PASSWORD` to `.env.local` to skip the login screen while developing.

## Live site
https://simfamilytree.com (GitHub Pages with a custom domain; the old https://pokejaysim.github.io/familytree/ address redirects there), deployed automatically by `.github/workflows/deploy.yml` on every push to `main`.
The two `VITE_*` values live in the repo's Actions variables. Supabase → Authentication → URL Configuration must list this URL as the Site URL so email confirmation links land on the live app.

See `CLAUDE.md` for architecture and data model.
