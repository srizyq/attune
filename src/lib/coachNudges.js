// Messages a coach can start from with one tap. They are drafts, never sent:
// the text lands in the message box for the coach to read, change and send, so
// nothing goes to a client the coach hasn't seen. Written to be warm, short and
// specific to why the coach is reaching out.

const first = (name) => String(name ?? '').trim().split(/\s+/)[0] || '';
const hi = (name) => (first(name) ? `Hi ${first(name)} — ` : 'Hi — ');

// One draft per reason a client can be flagged (see attentionFlags in
// lib/clientInsights.js). Unknown reasons fall back to a plain check-in.
const BY_FLAG = {
  inactive: (n) => `${hi(n)}I haven't seen anything logged for a few days. Is everything ok? Even a quick log of one meal helps me keep your plan on track.`,
  'never-logged': (n) => `${hi(n)}I noticed you haven't logged anything yet. Want a hand getting started? Logging just one meal today is plenty.`,
  'low-logging': (n) => `${hi(n)}I've only seen a few days logged this week. Anything making it hard to log? I can simplify things for you.`,
  'partial-days': (n) => `${hi(n)}some of your days are only partly logged, which makes it hard for me to see how you're really going. Could you aim to log every meal (even rough) for the next few days?`,
  'off-target': (n) => `${hi(n)}you've been a bit off your calorie target lately. Nothing to stress about — what's been getting in the way? We can adjust the plan if the target isn't working for you.`,
  'weight-stalled': (n) => `${hi(n)}your weight has been steady for a few weeks. That can be normal, so let's look at what's happening and tweak things together. When are you free for a quick chat?`,
  'weight-wrong-way': (n) => `${hi(n)}your weight has been heading the other way from your goal lately. Let's work out why — usually something small. Can you tell me how the last couple of weeks have felt?`,
  'weight-drifting': (n) => `${hi(n)}your weight has been drifting a bit. Let's check in on how things have been going and whether we should adjust anything.`,
  'targets-changed': (n) => `${hi(n)}I saw you've changed your own targets. No problem at all — I'd just like to hear what you were finding hard so I can help.`,
};

export function nudgeFor(flagId, name) {
  return (BY_FLAG[flagId] || ((n) => `${hi(n)}just checking in. How's the week going?`))(name);
}

// A few general-purpose starters shown above the message box.
export const QUICK_MESSAGES = [
  { id: 'checkin', label: 'Check in', text: (n) => `${hi(n)}just checking in — how's your week going?` },
  { id: 'praise', label: 'Nice work', text: (n) => `${hi(n)}great work this week. Keep it up!` },
  { id: 'energy', label: 'Energy & hunger', text: (n) => `${hi(n)}quick check — how are your energy and hunger levels this week?` },
  { id: 'photo', label: 'Ask for a photo', text: (n) => `${hi(n)}could you send a progress photo or measurements when you get a chance? It helps me see what the scale doesn't.` },
];

export const quickMessageText = (id, name) => (QUICK_MESSAGES.find((q) => q.id === id)?.text(name) ?? '');
