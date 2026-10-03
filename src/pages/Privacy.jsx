import LegalPageLayout, { Section, P, Ul } from '../components/LegalPageLayout';

export default function Privacy() {
  return (
    <LegalPageLayout title="Privacy Policy" updated="3 October 2026">
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
          <><b>Account info:</b> an email address and password.</>,
          <><b>Profile & goals:</b> name, date of birth, sex, age, weight, target weight, height, unit preference, fitness goal, activity level, and the calorie/macro/micronutrient targets calculated or set from these.</>,
          <><b>Food logs:</b> what you log — food name, portion, meal, time, and its full nutrition breakdown (calories, macros, and any micronutrients your database source or an AI estimate provides).</>,
          <><b>Weight logs, body measurements and mood/energy check-ins</b> you choose to record. This is health information, which privacy law treats as sensitive. You provide it voluntarily, we use it only to run the features you use, and you can delete it at any time.</>,
          <><b>Progress photos</b> you choose to add. These are stored privately in your account, visible only to you, and deleted when you remove them or delete your account.</>,
          <><b>Photos you submit</b> for photo scan, menu scan, or nutrition label scan. These are sent to our AI provider for one-time analysis and are <b>not stored</b> by us afterward — we keep the resulting nutrition estimate, not the image.</>,
          <><b>Voice recordings</b> when you use voice search or voice corrections. The audio is sent for one-time transcription and is <b>not stored</b> by us afterward.</>,
          <><b>Reminder and notification settings</b>, including the push subscription your browser creates if you turn reminders on.</>,
          <><b>Coach Mode data</b>, if you connect a trainer and client account: the connection itself, comments a trainer leaves, and the nutrition data a client's account shares with their connected trainer.</>,
          <><b>Basic usage metadata</b> needed to run the product, like your monthly AI-scan count (to enforce the free-tier limit) and whether your account is Pro.</>,
          <><b>Error reports</b> if the app crashes: the error message, the screen you were on, your device and browser type, and your account ID so we can fix the problem. They contain no food or health data.</>,
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
          <><b>OpenAI</b> — transcribes voice recordings for voice search and voice corrections. OpenAI receives the audio, not your account identity.</>,
          <><b>Resend</b> — delivers the account emails we send you, such as email confirmation and password reset. It receives your email address and the message.</>,
          <><b>Google Fonts</b> — serves the app's typefaces. Google receives your IP address and device information when the fonts load.</>,
          <><b>Cloudflare Turnstile</b> — a bot check that can run when you sign up or sign in. Cloudflare receives your IP address and browser details to tell people from automated traffic.</>,
          <><b>Browser and phone push services</b> (Apple, Google or Mozilla, depending on your device) — deliver reminder notifications if you turn them on.</>,
          <><b>Vercel</b> — hosts the app and the serverless functions that talk to Anthropic on your behalf.</>,
          <><b>FatSecret Platform API and Open Food Facts</b> — power food search and barcode lookup. Your search terms or scanned barcodes are sent to these services; your account identity is not.</>,
          <><b>Stripe</b> — processes payment for Pro and Coach Pass subscriptions. Stripe collects your payment details (e.g. card number) directly — we never see or store your full card details ourselves, only that a subscription exists and its status.</>,
        ]} />
        <P>We don't share your data with any other third party, and we don't sell it to anyone.</P>
      </Section>

      <Section title="4. Data retention & deletion">
        <P>
          We keep your data for as long as your account is active. You can delete your
          account and all associated data yourself at any time from Profile → Delete
          account. This removes your logs, health data, photos and settings and cancels
          any subscription, and it can't be undone. If you can't sign in, contact us
          (below) and we'll do it for you. Payment records held by Stripe, and backups,
          may persist for a limited period afterwards as the law or their retention
          schedules require.
        </P>
      </Section>

      <Section title="5. Security">
        <P>
          Data is encrypted in transit and at rest, and access to your data is
          restricted to your own account via row-level security on our database — no
          other user (aside from a trainer you've explicitly connected to, in Coach
          Mode) can read your logs. No system is perfectly secure, and we can't
          guarantee absolute security of information transmitted to the app.
        </P>
      </Section>

      <Section title="6. Children">
        <P>
          Attune isn't directed at children and isn't intended for use by anyone under
          16. We don't knowingly collect data from children under 16.
        </P>
      </Section>

      <Section title="7. Your rights">
        <P>
          Under Australian privacy law, you can request access to, correction of, or
          deletion of the personal data we hold about you. You can correct most of it
          yourself in the app and delete your account from Profile; for anything else,
          contact us using the details below.
        </P>
      </Section>

      <Section title="8. Changes to this policy">
        <P>
          If this policy changes materially, we'll update the date at the top of this
          page and, where practical, let you know in the app.
        </P>
      </Section>

      <Section title="9. Contact">
        <P>
          For any privacy question or request, contact: <b>attun3app@gmail.com</b>
        </P>
      </Section>
    </LegalPageLayout>
  );
}
