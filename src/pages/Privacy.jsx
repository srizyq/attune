import LegalPageLayout, { Section, P, Ul } from '../components/LegalPageLayout';

export default function Privacy() {
  return (
    <LegalPageLayout title="Privacy Policy" updated="8 September 2026">
      <P>
        Attune ("Attune", "we", "us") is currently operated by an individual, not a
        registered company, from Australia. This policy explains what data the
        Attune app collects, why, and who it's shared with. It's written to
        describe what the app actually does — not a generic template — but it
        isn't a substitute for your own legal advice if you have specific concerns.
      </P>

      <Section title="1. What we collect">
        <P>When you use Attune, we collect:</P>
        <Ul items={[
          <><b>Account info:</b> an email address and password if you create a real account, or nothing beyond a random anonymous ID if you use Guest mode.</>,
          <><b>Profile & goals:</b> name, date of birth, sex, age, weight, target weight, height, unit preference, fitness goal, activity level, and the calorie/macro/micronutrient targets calculated or set from these.</>,
          <><b>Food logs:</b> what you log — food name, portion, meal, time, and its full nutrition breakdown (calories, macros, and any micronutrients your database source or an AI estimate provides).</>,
          <><b>Weight logs and mood/energy check-ins</b> you choose to record.</>,
          <><b>Photos you submit</b> for photo scan, menu scan, or nutrition label scan. These are sent to our AI provider for one-time analysis and are <b>not stored</b> by us afterward — we keep the resulting nutrition estimate, not the image.</>,
          <><b>Reminder and notification settings</b>, including the push subscription your browser creates if you turn reminders on.</>,
          <><b>Coach Mode data</b>, if you connect a trainer and client account: the connection itself, comments a trainer leaves, and the nutrition data a client's account shares with their connected trainer.</>,
          <><b>Basic usage metadata</b> needed to run the product, like your monthly AI-scan count (to enforce the free-tier limit) and whether your account is Pro.</>,
        ]} />
      </Section>

      <Section title="2. Why we collect it">
        <P>
          We use this data to run the core product: calculating your targets, storing
          your logs so they persist across sessions and devices, generating AI-estimated
          nutrition from photos, sending reminders you've opted into, and — for Coach
          Mode — sharing the data a client explicitly connects to their trainer's view.
          We don't use your data for advertising, and we don't sell it.
        </P>
      </Section>

      <Section title="3. Who we share it with">
        <P>We use a small number of third-party services to run Attune. Each only sees the data it needs to do its job:</P>
        <Ul items={[
          <><b>Supabase</b> — hosts our database and handles authentication. All of your account and log data lives here.</>,
          <><b>Anthropic (Claude)</b> — processes photos you submit for AI food/menu/label recognition. Anthropic receives the image and a description of the task, not your account identity.</>,
          <><b>Vercel</b> — hosts the app and the serverless functions that talk to Anthropic on your behalf.</>,
          <><b>FatSecret Platform API and Open Food Facts</b> — power food search and barcode lookup. Your search terms or scanned barcodes are sent to these services; your account identity is not.</>,
        ]} />
        <P>We don't share your data with any other third party, and we don't sell it to anyone.</P>
      </Section>

      <Section title="4. Guest mode">
        <P>
          Guest mode still creates a real, private account behind the scenes so your
          data persists — it just doesn't require an email or password upfront. If you
          don't upgrade a guest account to a real one within the trial window shown in
          the app, that account and its data may be permanently deleted.
        </P>
      </Section>

      <Section title="5. Data retention & deletion">
        <P>
          We keep your data for as long as your account is active. You can request full
          deletion of your account and all associated data at any time by contacting us
          (below) — we'll action this within a reasonable time and confirm once it's done.
        </P>
      </Section>

      <Section title="6. Security">
        <P>
          Data is encrypted in transit and at rest, and access to your data is
          restricted to your own account via row-level security on our database — no
          other user (aside from a trainer you've explicitly connected to, in Coach
          Mode) can read your logs. No system is perfectly secure, and we can't
          guarantee absolute security of information transmitted to the app.
        </P>
      </Section>

      <Section title="7. Children">
        <P>
          Attune isn't directed at children and isn't intended for use by anyone under
          16. We don't knowingly collect data from children under 16.
        </P>
      </Section>

      <Section title="8. Your rights">
        <P>
          Under Australian privacy law, you can request access to, correction of, or
          deletion of the personal data we hold about you. Contact us using the details
          below to make a request.
        </P>
      </Section>

      <Section title="9. Changes to this policy">
        <P>
          If this policy changes materially, we'll update the date at the top of this
          page and, where practical, let you know in the app.
        </P>
      </Section>

      <Section title="10. Contact">
        <P>
          For any privacy question or request, contact: <b>[contact email — to be added]</b>
        </P>
      </Section>
    </LegalPageLayout>
  );
}
