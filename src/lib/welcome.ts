/** The welcome tour (components/WelcomeTour.tsx, opened by App.tsx) listens for this to play again on request. */
export const WELCOME_EVENT = 'sft:welcome'
export const replayWelcome = () => window.dispatchEvent(new Event(WELCOME_EVENT))

/** Set on this device once the foreword (or introduction) has been opened; the Getting started card ticks it off. */
export const forewordReadKey = (treeId: string) => `sft-foreword-read:${treeId}`
export const hasReadForeword = (treeId: string) => { try { return !!localStorage.getItem(forewordReadKey(treeId)) } catch { return false } }
