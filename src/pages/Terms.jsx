import LegalPageLayout, { Section, P, Ul } from '../components/LegalPageLayout';

export default function Terms() {
  return (
    <LegalPageLayout title="Terms of Service" updated="8 September 2026">
      <P>
        These terms govern your use of Attune, currently operated by an individual
        (not a registered company) from Australia. By creating an account or using
        Guest mode, you agree to them.
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
          <><b>Guest mode</b> creates a temporary account with no password. If it isn't upgraded to a real account within the trial window shown in the app, it — and all its data — may be permanently deleted with no way to recover it.</>,
        ]} />
      </Section>

      <Section title="4. Free and Pro features">
        <P>
          Attune offers a free tier and a Pro tier with additional features (such as
          unlimited AI scans and custom micronutrient targets). Feature availability
          may change over time. If and when paid subscriptions are introduced, separate
          billing terms — including price, billing cycle, and cancellation/refund
          policy — will apply and will be presented before you're charged.
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

      <Section title="6. Acceptable use">
        <P>You agree not to:</P>
        <Ul items={[
          'Use the app for anything illegal, or to harm, harass, or impersonate anyone.',
          'Attempt to abuse, automate, or exceed the intended use of the AI scan features (e.g. scripted mass-scanning to get around usage limits).',
          'Attempt to access another user’s account or data without authorization.',
          'Reverse-engineer or interfere with the app’s normal operation.',
        ]} />
      </Section>

      <Section title="7. Intellectual property">
        <P>
          The Attune name, design, and app content are owned by its operator. Your
          own logged data remains yours — using the app doesn't give us any ownership
          over it, beyond what's needed to operate the service (e.g. Coach Mode sharing
          you've explicitly turned on).
        </P>
      </Section>

      <Section title="8. Disclaimer & limitation of liability">
        <P>
          Attune is provided "as is," without warranties of any kind. To the maximum
          extent permitted by law, we are not liable for any health outcome, injury,
          or loss arising from your use of the app, reliance on its estimates or
          insights, or any decision made based on them.
        </P>
      </Section>

      <Section title="9. Termination">
        <P>
          We may suspend or terminate an account that violates these terms. You can
          stop using Attune and request account deletion at any time (see the Privacy
          Policy for how).
        </P>
      </Section>

      <Section title="10. Changes to these terms">
        <P>
          We may update these terms as the app changes. Material changes will update
          the date at the top of this page, and where practical, we'll let you know
          in the app.
        </P>
      </Section>

      <Section title="11. Governing law">
        <P>These terms are governed by the laws of Australia.</P>
      </Section>

      <Section title="12. Contact">
        <P>
          Questions about these terms: <b>attun3app@gmail.com</b>
        </P>
      </Section>
    </LegalPageLayout>
  );
}
