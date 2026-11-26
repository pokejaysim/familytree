import { useQuery } from '@tanstack/react-query'
import { call, pb } from './pb'
import { noteSignIn } from './splash'

/** Remembered on each device after a sign-in, so returning members skip the welcome and get the sign-in form. */
const SIGNED_IN_BEFORE = 'sft-signed-in-before'
export const signedInBefore = () => { try { return !!localStorage.getItem(SIGNED_IN_BEFORE) } catch { return false } }
/** Call after any successful sign-in: remembers the device and plays the splash. */
export const signedIn = () => {
  try { localStorage.setItem(SIGNED_IN_BEFORE, '1') } catch { /* storage unavailable: they'll see the welcome again */ }
  noteSignIn()
}

/*
 * "Continue with Google" (pocketbase/pb_hooks/google.pb.js), done as a plain redirect rather than a popup,
 * so it works the same on phones. The site sends people to Google, and Google sends them back to the
 * home page (https://simfamilytree.com/, the address registered with Google) with ?code=…&state=….
 * App.tsx then hands the code to PocketBase, which checks it with Google and signs them in, making a
 * new (waiting for approval) account if needed. The state and PKCE verifier wait in this tab's
 * sessionStorage meanwhile, and a returning code only counts if its state matches.
 */
const GOOGLE = 'sft-google-sign-in'
const redirectURL = () => `${location.origin}/`

/** Whether Google sign-in is switched on (an admin turns it on from the Admin page). */
export const useGoogleSignIn = () =>
  useQuery({
    queryKey: ['googleSignIn'],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => (await pb.collection('users').listAuthMethods()).oauth2.providers.some((p) => p.name === 'google'),
  })

export async function startGoogle() {
  // Fresh each time: every trip to Google gets its own state and verifier.
  const p = (await pb.collection('users').listAuthMethods()).oauth2.providers.find((x) => x.name === 'google')
  if (!p) throw new Error('Google sign-in isn’t switched on at the moment. Use your email and password instead.')
  sessionStorage.setItem(GOOGLE, JSON.stringify({ state: p.state, verifier: p.codeVerifier, redirect: redirectURL() }))
  location.assign(p.authURL + encodeURIComponent(redirectURL()))
}

/** The parts of the address Google adds on the way back. */
export const GOOGLE_PARAMS = ['code', 'state', 'scope', 'authuser', 'hd', 'prompt', 'iss', 'error', 'error_description', 'error_subtype']

/** True when this page load is someone coming back from Google (finishGoogle checks it was this tab that sent them). */
export const isGoogleReturn = (params: URLSearchParams) => params.has('state') && (params.has('code') || params.has('error'))

/** Finish a Google sign-in. Throws a message fit to show on the sign-in page. */
export async function finishGoogle(params: URLSearchParams) {
  let saved: { state: string; verifier: string; redirect: string } | null = null
  try { saved = JSON.parse(sessionStorage.getItem(GOOGLE) ?? 'null'); sessionStorage.removeItem(GOOGLE) } catch { /* treated as not started here */ }
  if (params.get('error') === 'access_denied') throw new Error('Google sign-in was cancelled. Try again, or use your email and password.')
  const code = params.get('code')
  if (!saved || !code || params.get('state') !== saved.state) throw new Error('Google sign-in didn’t finish. Please try again.')
  try {
    await pb.collection('users').authWithOAuth2Code('google', code, saved.verifier, saved.redirect)
  } catch (err) {
    const status = (err as { status?: number })?.status
    console.warn('Google sign-in failed', err)
    throw new Error(status === 0 ? 'Couldn’t reach the family tree server. Check your connection and try again.'
      : status === 429 ? 'Too many sign-ins from this internet connection. Wait a minute, then try again.'
      : 'Google sign-in didn’t work. Please try again, or use your email and password.')
  }
  signedIn()
}

/** The Admin page's view of Google sign-in. The client secret never comes back from the server. */
export interface GoogleSetup { on: boolean; clientId: string }
export const useGoogleSetup = (enabled: boolean) =>
  useQuery({ queryKey: ['googleSetup'], enabled, queryFn: () => call(pb.send<GoogleSetup>('/api/sft/google', {})) })
export const switchOnGoogle = (clientId: string, clientSecret: string) =>
  call(pb.send<GoogleSetup>('/api/sft/google', { method: 'POST', body: { clientId, clientSecret } }))
export const switchOffGoogle = () => call(pb.send<GoogleSetup>('/api/sft/google', { method: 'DELETE' }))
