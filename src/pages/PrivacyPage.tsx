import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader'
import { useAuth } from '../lib/auth'

/**
 * The privacy page, open to everyone signed in or not (App.tsx lets /privacy through), because
 * Google's sign-in setup needs a public privacy policy link. The deploy copies index.html to
 * privacy.html so the address answers with a normal page rather than the 404 fallback.
 * Keep it true: if what the site keeps or who handles it changes, change this page and its date.
 */
export default function PrivacyPage() {
  const { session } = useAuth()
  const help = <Link className="text-brass underline underline-offset-2 hover:text-moss" to="/help">Help page</Link>

  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <main className="min-h-0 flex-1 overflow-auto">
        <article className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
          <h1 className="text-3xl leading-tight sm:text-4xl">Privacy</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-ink-soft">Sim Family Tree is a private website for the descendants of Ignatius Ribut Sim and Teresa, run by members of the family. This page says what the site keeps about you, who can see it, and how to have it changed or removed.</p>
          <p className="mt-2 text-[15px] text-ink-mute">Last updated 26 November 2026</p>
          {!session && <p className="mt-3 text-[16px]"><Link to="/" className="text-brass underline underline-offset-4 hover:text-moss">Back to sign in</Link></p>}

          <Section title="What we keep">
            <li>Your account: your name, your email address and your password. The password is stored scrambled, so nobody can read it, including us.</li>
            <li>What you add: suggested edits, stories, photos and documents, and any message you send from the {help}. We note who made each change and when, so it can be checked and undone.</li>
            <li>A few details that help run the site: when you last visited, whether you’ve seen the welcome video, and whether you want the family news emails.</li>
            <li>Our server’s logs record the internet address (IP address) of each visit, to help fix problems and stop misuse. They’re deleted after 5 days.</li>
          </Section>

          <Section title="If you sign in with Google">
            <li>Google gives us your name, your email address and an ID number for your Google account. We use them only to create your account here and sign you in.</li>
            <li>We never see your Google password, and the site can’t read your Gmail, contacts or anything else in your Google account.</li>
            <li>We don’t share what Google gives us with anyone.</li>
          </Section>

          <Section title="Who can see it">
            <li>The tree, its photos and stories can only be seen by family members we’ve approved, once they’ve signed in. The site is hidden from search engines.</li>
            <li>Other members can’t see your email address or account details. Only the people who run the site can.</li>
            <li>We never sell or share your information, and there are no ads or tracking on the site.</li>
          </Section>

          <Section title="Information about relatives">
            <li>The tree holds names, dates, photos and stories about family members, living and dead, including people who don’t have an account. Most of it comes from Bernard Sim’s family book and the rest from relatives.</li>
            <li>If something about you or your child is wrong, or you’d like it taken out, send us a message from the {help} and we’ll correct or remove it.</li>
          </Section>

          <Section title="Where it’s kept">
            <li>Everything is kept on a small server we run ourselves, with daily backup copies on our own drives.</li>
            <li>A few companies handle parts of the site. GitHub serves the website’s pages, Cloudflare carries traffic between your browser and our server, and our emails (sign-up notices, password links and family news) are sent through Gmail. Like any web service, they see internet addresses as the site is used.</li>
            <li>An older copy of the tree, from before 25 November 2026, is still held by Supabase, the service the site used before. We plan to delete it in December 2026.</li>
            <li>If you tap the Buy Me a Coffee link, that site’s own privacy policy applies.</li>
          </Section>

          <Section title="In your browser">
            <li>The site saves a few small things in your browser: your sign-in, so you stay signed in, and settings such as which way the map is turned and which news you’ve seen. There are no advertising or tracking cookies.</li>
          </Section>

          <Section title="Changing or deleting your information">
            <li>You can stop the family news emails at any time with the switch on the News page or the link at the bottom of any news email.</li>
            <li>To change your email address, delete your account, or have anything about you removed from the tree, send us a message from the {help}. Deleted information can stay in our backup copies for a short time until they’re replaced.</li>
            <li>If we change this page, we’ll update the date at the top.</li>
          </Section>
        </article>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[19px] text-ink">{title}</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[16px] leading-relaxed text-ink-soft marker:text-sage">{children}</ul>
    </section>
  )
}
