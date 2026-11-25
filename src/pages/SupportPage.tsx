import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { CoffeeIcon } from '../components/SupportLine'
import { ADMIN_NAME, DONATE_URL } from '../config'
import divider from '../assets/branch-divider.svg'

/** "Support this site": what donations pay for, and the other ways relatives can help. Uses the journal illustration from the coffee asset pack. */
export default function SupportPage() {
  const art = `${import.meta.env.BASE_URL}art/coffee-and-memories`
  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <div className="flex-1 overflow-auto">
        <article className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
          <h1 className="text-center text-3xl leading-tight sm:text-4xl">Help keep our family tree online.</h1>
          <img src={divider} alt="" width={200} height={20} className="mx-auto mt-4 opacity-90" />
          <img src={`${art}-480.webp`} srcSet={`${art}-480.webp 480w, ${art}-960.webp 960w`} sizes="(min-width: 640px) 420px, 80vw" width={960} height={720} alt="" className="art-fade mx-auto -my-2 w-[420px] max-w-full" />

          <p className="text-center text-[17px] leading-relaxed text-ink-soft">
            This site is free for every member of the family, and it always will be. It takes time and a little money to
            build and keep running. Optional donations through Buy Me a Coffee help cover development and hosting.
          </p>

          <section className="mt-10">
            <h2 className="text-[22px] text-ink">Where it goes</h2>
            <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-white">
              {[
                ['The home server', `The site and every record in it run on a small computer ${ADMIN_NAME} keeps at home.`],
                ['Storage and backups', 'Every portrait and scanned page is stored on its drives and copied to a second drive every night. The archive grows with each section of the book that’s added.'],
                ['A proper address', 'A domain name of our own, so the link to the family tree never has to change.'],
              ].map(([title, text]) => (
                <li key={title} className="px-5 py-4">
                  <p className="text-[17px]">{title}</p>
                  <p className="mt-0.5 text-[15px] text-ink-mute">{text}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="text-[22px] text-ink">Other ways to help</h2>
            <p className="mt-3 text-[17px] leading-relaxed text-ink-soft">
              Photos, dates, stories and corrections are what the site is for, so they help as much as money does. If you spot a
              mistake, or have a picture the rest of the family has never seen, add it to that person’s page or send it to {ADMIN_NAME}.
            </p>
          </section>

          <div className="mt-12 flex flex-col items-center gap-4 text-center">
            {DONATE_URL && (
              <a href={DONATE_URL} target="_blank" rel="noreferrer" className="btn-primary min-h-[46px] whitespace-nowrap px-6">
                <CoffeeIcon className="h-5 w-5" /> Donate via Buy Me a Coffee
              </a>
            )}
          </div>

          <p className="mt-12 text-center text-[17px] italic text-ink-soft">Thank you. Every donation goes into keeping the site running.</p>
          <p className="mt-8 text-center">
            <Link to="/" className="text-[16px] text-brass underline underline-offset-4 hover:text-moss">Back to the family tree</Link>
          </p>
        </article>
      </div>
    </div>
  )
}
