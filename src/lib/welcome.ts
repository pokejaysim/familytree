/** The welcome tour (components/WelcomeTour.tsx, opened by App.tsx) listens for this to play again on request. */
export const WELCOME_EVENT = 'sft:welcome'
export const replayWelcome = () => window.dispatchEvent(new Event(WELCOME_EVENT))
