/**
 * Two-second login splash, ported from Jason's splash pack (docs/splash-README.md).
 * Roots reveal, seven leaves open, the title fades in, then everything clears.
 * Decorative only: pointer-events none, never steals focus, skipped for reduced-motion users,
 * cleaned up on completion (2.2 s fallback) or when the tab is hidden.
 */
const TREE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" aria-hidden="true" fill="#2F4B3A"><g transform="translate(4 2)">' +
  '<path class="leaf" style="--delay:540ms" d="M32 3C24 11 27 18 32 22C37 18 40 10 32 3Z" fill="#AF8C45"/>' +
  '<path class="leaf" style="--delay:420ms" d="M14 11C14 19 18 24 25 24C25 18 21 12 14 11Z"/>' +
  '<path class="leaf" style="--delay:480ms" d="M50 11C50 19 46 24 39 24C39 18 43 12 50 11Z"/>' +
  '<path class="leaf" style="--delay:300ms" d="M5 23C8 31 14 33 23 30C19 23 12 21 5 23Z"/>' +
  '<path class="leaf" style="--delay:360ms" d="M59 23C56 31 50 33 41 30C45 23 52 21 59 23Z"/>' +
  '<path class="leaf" style="--delay:180ms" d="M6 41C14 42 21 38 24 32C16 31 9 34 6 41Z"/>' +
  '<path class="leaf" style="--delay:240ms" d="M58 41C50 42 43 38 40 32C48 31 55 34 58 41Z"/>' +
  '<path class="trunk" d="M32 20C29 25 29 30 30 34C27 29 24 26 20 25C25 31 28 37 28 43C28 50 23 52 17 53C12 54 9 57 8 60C16 55 23 57 29 52C31 55 29 59 30 63C34 60 35 56 35 52C40 56 47 54 55 60C53 55 48 54 43 52C37 50 35 46 35 40C35 34 39 29 44 26C39 27 36 30 34 33C31 27 32 23 32 20Z"/>' +
  '</g></svg>'

const STYLES = `
:host{all:initial;position:fixed;inset:0;z-index:2147483000;pointer-events:none;}
.overlay{position:absolute;inset:0;background:#FAF8F3;display:grid;place-items:center;animation:sft-exit 350ms ease-in-out 1650ms both;}
.composition{display:flex;align-items:center;flex-direction:column;transform:translateY(-10px);width:calc(100% - 32px);color:#2F4B3A;}
svg{display:block;width:144px;height:144px;overflow:visible;}
.trunk{animation:sft-root 440ms cubic-bezier(0,0,.58,1) 40ms both;}
.leaf{transform-box:view-box;transform-origin:36px 36px;animation:sft-leaf 280ms cubic-bezier(0,0,.58,1) var(--delay) both;}
.title{font-family:"EB Garamond",Georgia,"Times New Roman",serif;font-weight:400;font-size:40px;line-height:1.3;text-align:center;margin:16px 0 0;animation:sft-title 440ms cubic-bezier(0,0,.58,1) 580ms both;}
.rule{width:38px;height:2px;margin-top:16px;background:#AF8C45;animation:sft-rule 280ms cubic-bezier(0,0,.58,1) 820ms both;}
@keyframes sft-root{from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0)}}
@keyframes sft-leaf{from{opacity:0;transform:scale(.72)}to{opacity:1;transform:scale(1)}}
@keyframes sft-title{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes sft-rule{from{opacity:0;transform:scaleX(0)}to{opacity:1;transform:scaleX(1)}}
@keyframes sft-exit{from{opacity:1}to{opacity:0}}
@media(max-width:480px){svg{width:124px;height:124px}.title{font-size:32px}}
@media(prefers-reduced-motion:reduce){.overlay{display:none}.overlay *{animation:none!important}}
`

let active: Promise<void> | null = null

/** Play the splash once; resolves when the overlay is gone. Concurrent calls share one run. */
export function showSplash(): Promise<void> {
  if (typeof document === 'undefined' || !document.body || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve()
  if (active) return active

  const host = document.createElement('div')
  host.setAttribute('data-sim-family-splash', '')
  host.setAttribute('aria-hidden', 'true')
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = STYLES
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  overlay.innerHTML = `<div class="composition">${TREE}<p class="title">Sim Family Tree</p><div class="rule"></div></div>`
  shadow.append(style, overlay)

  active = new Promise<void>((resolve) => {
    let finished = false
    const cleanup = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      host.remove()
      active = null
      resolve()
    }
    const onVisibility = () => { if (document.hidden) cleanup() }
    overlay.addEventListener('animationend', (ev) => { if (ev.target === overlay && ev.animationName === 'sft-exit') cleanup() })
    document.addEventListener('visibilitychange', onVisibility)
    const timer = setTimeout(cleanup, 2200)
    document.body.append(host)
  })
  return active
}
