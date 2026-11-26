import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * A Content-Security-Policy for the published site: the browser will only run the site's own code,
 * and only talk to the site and the family tree server. It limits the damage if a flaw is ever
 * found in the pages. Added at build time only; the dev server needs looser rules to hot-reload.
 * (GitHub Pages can't send it as a header, so it goes in a meta tag.)
 */
function contentSecurityPolicy(api: string): Plugin {
  const server = api ? new URL(api).origin : ''
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // React's style attributes and the splash's own stylesheet
    `img-src 'self' data: blob: ${server}`,
    "font-src 'self'",
    `connect-src 'self' ${server}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'sft-content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  }
}

// BASE_PATH is set by the GitHub Pages workflow ("/"); local dev serves from "/" too.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  return {
    base: process.env.BASE_PATH || '/',
    plugins: [react(), tailwindcss(), contentSecurityPolicy(env.VITE_PB_URL ?? '')],
  }
})
