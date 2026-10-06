import LegalPageLayout, { Section, P, Ul } from '../components/LegalPageLayout';

export default function Terms() {
  return (
    <LegalPageLayout title="Terms of Service" updated="7 October 2026">
      <P>
        These terms govern your use of Attune, currently operated by an individual
        (not a registered company) from Australia. By creating an account, you agree
        to them.
      </P>

      <Section title="1. Not medical advice">
        <P>
          Attune is a food and habit tracking tool. Calorie and macro/micronutrient
          targets, AI-estimated nutrition from photos, and any patterns or insights the
          app surfaces are <b>estimates for general informational purposes only</b> —
          not medical, dietary, or health advice. They are not a substitute for advice
          from a qualified doctor, dietitian, or other healthcare professional.
          Talk to a professional before making health decisions, especially if you're
          pregnant, have a medical condition, or have a history of disordered eating.
        </P>
      </Section>

      <Section title="2. AI estimates aren't guaranteed accurate">
        <P>
          Photo scan, menu scan, and label scan use AI to estimate nutrition from an
          image. These are best-effort visual estimates, not verified lab measurements
          — they can be wrong, sometimes significantly. Review any AI estimate before
          relying on it, and use the correction feature or manual search if it looks
          off.
        </P>
      </Section>

      <Section title="3. Accounts">
        <Ul items={[
          <>You must be at least 16 years old to use Attune.</>,
          <>You're responsible for keeping your login credentials secure and for all activity under your account.</>,
          <>Creating an account requires a valid email address you can access — some features, and regaining access if you log out beforehand, depend on confirming it.</>,
        ]} />
      </Section>

      <Section title="4. Paid subscriptions (Pro and Coach Pass)">
        <P>
          Attune offers a free tier, a <b>Pro</b> tier (unlimited AI scans, custom
          micronutrient targets, and other features), and <b>Coach Pass</b> for
          trainers using Coach Mode. Both are billed monthly through Stripe and
          auto-renew until cancelled. The exact price is shown by Stripe before you
          confirm payment.
        </P>
        <P>
          You can cancel anytime from Settings — cancellation stops the next renewal,
          but the current billing period you've already paid for runs out as normal.{' '}
          <b>We don't offer refunds</b>, including for partial billing periods or
          unused time. Feature availability for each tier may change over time.
        </P>
      </Section>

      <Section title="5. Coach Mode">
        <P>
          Coach Mode lets a client account share its nutrition data with a connected
          trainer account, and lets a trainer set targets or leave comments on a
          connected client's data. Connecting is opt-in on both sides. Attune is not a
          party to the relationship between a trainer and client, doesn't vet trainers'
          qualifications, and isn't responsible for advice a trainer gives outside the
          app.
        </P>
      </Section>

      <Section title="6. Community">
        <P>
          Community lets you share days, meals and recipes with other people. It is
          optional, and only for people aged 16 and over. By posting you agree that:
        </P>
        <Ul items={[
          'You are responsible for what you post. Share only your own food logs, recipes and photos of food, and only photos you have the right to share.',
          'You keep ownership of what you post, and you give Attune permission to show it to the people your audience setting allows, and to let them copy it into their own diary.',
          'You will not post anything abusive, hateful, sexual, violent, or that promotes eating disorders or extreme dieting, and you will not advertise, post links, or pretend to be someone else.',
          'Everything on Community is shared by other users, not checked by us for accuracy. Calories, macros and recipes from other people are not medical or dietary advice (see section 1).',
          'We may remove content, restrict features, or suspend an account that breaks these rules, with or without notice, and we act on reports. You can report and block anyone from the app.',
        ]} />
      </Section>

      <Section title="7. Acceptable use">
        <P>You agree not to:</P>
        <Ul items={[
          'Use the app for anything illegal, or to harm, harass, or impersonate anyone.',
          'Attempt to abuse, automate, or exceed the intended use of the AI scan features (e.g. scripted mass-scanning to get around usage limits).',
          'Attempt to access another user’s account or data without authorization.',
          'Reverse-engineer or interfere with the app’s normal operation.',
        ]} />
      </Section>

      <Section title="8. Intellectual property">
        <P>
          The Attune name, design, and app content are owned by its operator. Your
          own logged data remains yours — using the app doesn't give us any ownership
          over it, beyond what's needed to operate the service (e.g. Coach Mode sharing
          you've explicitly turned on).
        </P>
      </Section>

      <Section title="9. Disclaimer & limitation of liability">
        <P>
          Attune is provided "as is," without warranties of any kind. To the maximum
          extent permitted by law, we are not liable for any health outcome, injury,
          or loss arising from your use of the app, reliance on its estimates or
          insights, or any decision made based on them.
        </P>
      </Section>

      <Section title="10. Termination">
        <P>
          We may suspend or terminate an account that violates these terms. You can
          stop using Attune and request account deletion at any time (see the Privacy
          Policy for how).
        </P>
      </Section>

      <Section title="11. Changes to these terms">
        <P>
          We may update these terms as the app changes. Material changes will update
          the date at the top of this page, and where practical, we'll let you know
          in the app.
        </P>
      </Section>

      <Section title="12. Governing law">
        <P>These terms are governed by the laws of Australia.</P>
      </Section>

      <Section title="13. Contact">
        <P>
          Questions about these terms: <b>attun3app@gmail.com</b>
        </P>
      </Section>
    </LegalPageLayout>
  );
}
