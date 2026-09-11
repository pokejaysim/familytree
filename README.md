# Family Tree

Private family-tree app: people, relationships, an interactive pan/zoom chart, photos, and sources with citations.

## Setup
```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + publishable key
npm run dev
```
Sign up with email + password, confirm the email, create a tree, add people.

## Deploy
Static build (`npm run build` → `dist/`). Deploy to Cloudflare Pages, Vercel, or Netlify with the two `VITE_*` env vars set.
Add the deployed URL to Supabase → Authentication → URL Configuration so confirmation emails redirect correctly.

See `CLAUDE.md` for architecture and data model.
