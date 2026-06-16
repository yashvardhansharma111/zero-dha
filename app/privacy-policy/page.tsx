import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Nokia Securities",
  description:
    "Privacy Policy for Nokia Securities — a paper trading (simulated) app.",
};

const LAST_UPDATED = "May 6, 2026";
const SUPPORT_EMAIL = "support@nokiasecurities.in";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-lg font-bold text-white">
              N
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">
              Nokia Securities
            </span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-slate-600 transition hover:text-emerald-600"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-14 lg:py-20">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Paper Trading App · Simulated Trades Only
        </div>

        <article>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Last updated: {LAST_UPDATED}
          </p>

          <Section title="1. Introduction">
            <p>
              Nokia Securities (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or
              &ldquo;us&rdquo;) operates the Nokia Securities mobile application
              and the website at{" "}
              <a href="https://app.zero-dha1.in">https://app.zero-dha1.in</a>{" "}
              (collectively, the &ldquo;Service&rdquo;). The Service is a{" "}
              <strong>paper trading (simulated) application</strong> intended
              for education and practice. No real money is invested, deposited,
              withdrawn, or transferred through the Service.
            </p>
            <p>
              This Privacy Policy explains what information we collect, how we
              use it, and the choices you have. By using the Service you agree
              to the practices described here.
            </p>
          </Section>

          <Section title="2. Information we collect">
            <ul>
              <li>
                <strong>Account information:</strong> full name, email address,
                phone number, and a password you set during registration.
              </li>
              <li>
                <strong>KYC-style documents (optional):</strong> any signature
                or identity image you choose to upload during onboarding. These
                are used solely to confirm an account inside the simulator and
                are never shared with any real-world broker, exchange, or
                custodian.
              </li>
              <li>
                <strong>Simulated activity:</strong> orders, positions,
                watchlists, and the virtual ledger inside the app. All of this
                is simulated.
              </li>
              <li>
                <strong>Device &amp; usage data:</strong> basic technical
                information such as app version, OS version, and crash logs
                needed to keep the app working.
              </li>
            </ul>
          </Section>

          <Section title="3. What we do NOT collect">
            <ul>
              <li>
                We do <strong>not</strong> collect or store real bank account
                numbers, real card numbers, demat account numbers, or PAN
                beyond what you optionally type into the simulator&rsquo;s
                profile.
              </li>
              <li>
                We do <strong>not</strong> place real trades on any stock
                exchange.
              </li>
              <li>
                We do <strong>not</strong> sell your personal information to
                third parties.
              </li>
            </ul>
          </Section>

          <Section title="4. How we use your information">
            <ul>
              <li>To create, secure, and maintain your simulator account.</li>
              <li>
                To send you account-related emails (e.g., your simulator login
                credentials).
              </li>
              <li>
                To respond to your support requests sent to{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
              </li>
              <li>
                To improve the app&rsquo;s reliability and detect abuse of the
                Service.
              </li>
            </ul>
          </Section>

          <Section title="5. How we store and protect your information">
            <p>
              Account data is stored in a managed database (MongoDB Atlas) with
              access restricted to authorised administrators. Passwords are
              hashed before being stored. We rely on industry-standard
              transport encryption (HTTPS) for data in transit. No method of
              transmission or storage is 100% secure, but we apply reasonable
              safeguards to protect your data.
            </p>
          </Section>

          <Section title="6. Third-party services">
            <p>We use the following third parties to operate the Service:</p>
            <ul>
              <li>
                <strong>MongoDB Atlas</strong> &mdash; managed database
                hosting.
              </li>
              <li>
                <strong>Gmail / SMTP</strong> &mdash; to send account
                credentials and support emails.
              </li>
              <li>
                <strong>UploadThing</strong> &mdash; to store optional
                document/image uploads from the simulator.
              </li>
              <li>
                <strong>Expo Application Services (EAS)</strong> &mdash; to
                build and distribute the Android app.
              </li>
            </ul>
            <p>
              Each provider has its own privacy policy. We share only the
              minimum information required for the Service to function.
            </p>
          </Section>

          <Section title="7. Your rights">
            <p>You may request, at any time, that we:</p>
            <ul>
              <li>Provide a copy of the personal data we hold about you.</li>
              <li>Correct inaccurate personal data.</li>
              <li>Delete your account and associated data.</li>
            </ul>
            <p>
              To exercise any of these rights, email{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We will
              respond within 30 days.
            </p>
          </Section>

          <Section title="8. Children">
            <p>
              The Service is not directed to children under 13. We do not
              knowingly collect personal data from children under 13. If you
              believe a child has provided us personal data, contact us so we
              can delete it.
            </p>
          </Section>

          <Section title="9. Changes to this policy">
            <p>
              We may update this Privacy Policy from time to time. The
              &ldquo;Last updated&rdquo; date at the top of this page reflects
              the latest revision. Material changes will be highlighted in the
              app or on our website.
            </p>
          </Section>

          <Section title="10. Contact us">
            <p>
              For any privacy-related questions, contact us at{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
            </p>
          </Section>
        </article>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50/60">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:justify-between">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-xs font-bold text-white">
                  N
                </div>
                <span className="text-sm font-semibold text-slate-900">
                  Nokia Securities
                </span>
              </div>
              <p className="text-xs text-slate-500">
                &copy; {new Date().getFullYear()} Nokia Securities. All rights
                reserved.
              </p>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-semibold text-slate-900">Contact</p>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-slate-600 transition hover:text-emerald-600"
              >
                {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-600 [&_a]:text-emerald-600 [&_a]:underline [&_a]:underline-offset-4 [&_strong]:text-slate-900 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
