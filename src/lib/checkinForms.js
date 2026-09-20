// Pure logic for weekly check-in forms: building and validating questions,
// validating answers, and working out when the next check-in is due. The
// rules mirror valid_checkin_questions / valid_checkin_answers in
// supabase/schema.sql — the database is the authority; this exists so the
// editor and the form can say what's wrong before a round trip, and
// checkinForms.test.js is the drift guard.

export const MAX_QUESTIONS = 12;
export const MAX_LABEL = 200;
export const MAX_TEXT_ANSWER = 2000;
export const MAX_TITLE = 80;
export const ID_PATTERN = /^[a-z0-9_]{1,40}$/;

export const QUESTION_TYPES = [
  { id: 'scale', label: '1–10 scale' },
  { id: 'yesno', label: 'Yes / no' },
  { id: 'text', label: 'Written answer' },
];

export const CADENCES = [
  { days: 7, label: 'Every week' },
  { days: 14, label: 'Every 2 weeks' },
  { days: 30, label: 'Every month' },
];

const q = (id, type, label) => ({ id, type, label });
export const TEMPLATE_QUESTIONS = [
  q('sleep', 'scale', 'How well did you sleep this week?'),
  q('energy', 'scale', 'How were your energy levels?'),
  q('stress', 'scale', 'How stressed did you feel?'),
  q('hunger', 'scale', 'How hungry were you between meals?'),
  q('adherence', 'scale', 'How closely did you stick to your plan?'),
  q('wins', 'text', 'Any wins this week?'),
  q('struggles', 'text', 'Anything that got in the way?'),
];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A short id no other question is using, e.g. "q1", "q2"…
export function newQuestionId(questions) {
  const taken = new Set((questions || []).map((x) => x.id));
  for (let n = 1; n <= MAX_QUESTIONS + 1; n++) if (!taken.has(`q${n}`)) return `q${n}`;
  return `q${Date.now()}`;
}

export function newQuestion(questions, type = 'scale') {
  return { id: newQuestionId(questions), type, label: '' };
}

// null if the questions are acceptable, else the first problem in words.
export function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return 'Add at least one question.';
  if (questions.length > MAX_QUESTIONS) return `A check-in can have at most ${MAX_QUESTIONS} questions.`;
  const seen = new Set();
  for (const [i, item] of questions.entries()) {
    const n = i + 1;
    if (!isPlainObject(item)) return `Question ${n} is malformed.`;
    if (typeof item.id !== 'string' || !ID_PATTERN.test(item.id)) return `Question ${n} has an invalid id.`;
    if (seen.has(item.id)) return `Question ${n} repeats another question's id.`;
    seen.add(item.id);
    if (!QUESTION_TYPES.some((t) => t.id === item.type)) return `Question ${n} has an unknown type.`;
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (label.length === 0) return `Question ${n} needs some text.`;
    if (label.length > MAX_LABEL) return `Question ${n} is too long (${MAX_LABEL} characters max).`;
  }
  return null;
}

// Trim labels (the editor lets people leave trailing spaces) without touching
// anything else, ready to send.
export const cleanQuestions = (questions) => questions.map((x) => ({ ...x, label: String(x.label ?? '').trim() }));

// null if the answers are acceptable for these questions, else the first problem.
export function validateAnswers(questions, answers) {
  if (!isPlainObject(answers)) return 'Answer the questions first.';
  for (const item of questions) {
    const v = answers[item.id];
    if (item.type === 'scale') {
      if (!Number.isInteger(v) || v < 1 || v > 10) return `Choose a number from 1 to 10 for “${item.label}”.`;
    } else if (item.type === 'yesno') {
      if (typeof v !== 'boolean') return `Choose yes or no for “${item.label}”.`;
    } else if (item.type === 'text') {
      if (typeof v !== 'string') return `Check your answer to “${item.label}”.`;
      if (v.length > MAX_TEXT_ANSWER) return `“${item.label}” is too long (${MAX_TEXT_ANSWER} characters max).`;
    }
  }
  return null;
}

// The starting point for a form: nothing answered for scale/yesno, empty text.
export function blankAnswers(questions) {
  return Object.fromEntries(questions.map((x) => [x.id, x.type === 'text' ? '' : null]));
}

// When is the next check-in due? A form with no responses is due straight
// away; otherwise `cadence_days` after the last one. Inactive forms are never
// due. `now` is injectable for testing.
export function dueState(form, lastResponseAt, now = Date.now()) {
  if (!form || !form.is_active) return { due: false, dueAt: null, inactive: true };
  const from = lastResponseAt ? new Date(lastResponseAt).getTime() : new Date(form.created_at).getTime();
  const dueAt = new Date(from + form.cadence_days * 86400000);
  const t = typeof now === 'number' ? now : new Date(now).getTime();
  return { due: !lastResponseAt || t >= dueAt.getTime(), dueAt, inactive: false };
}

// One response, ready to display: each snapshot question paired with its answer.
export function describeResponse(response) {
  return (response.questions_snapshot || []).map((question) => {
    const a = response.answers?.[question.id];
    return {
      id: question.id,
      label: question.label,
      type: question.type,
      value: a,
      text: question.type === 'yesno' ? (a === true ? 'Yes' : a === false ? 'No' : '—') : question.type === 'scale' ? (a == null ? '—' : `${a}/10`) : String(a ?? '').trim() || '—',
    };
  });
}

// Recent answers to the same scale question across responses, oldest first —
// for a coach to see "sleep 4, 5, 7, 8" as a trend. Matches on the question's
// label (ids are per-form and can change if a coach rebuilds the form).
export function scaleTrend(responses, label) {
  return [...responses]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((r) => {
      const item = describeResponse(r).find((d) => d.type === 'scale' && d.label === label);
      return item && Number.isFinite(item.value) ? item.value : null;
    })
    .filter((v) => v != null);
}
