import { describe, it, expect } from 'vitest';
import {
  QUESTION_TYPES, CADENCES, TEMPLATE_QUESTIONS, MAX_QUESTIONS, newQuestionId, newQuestion,
  validateQuestions, cleanQuestions, validateAnswers, blankAnswers, dueState, describeResponse, scaleTrend,
} from './checkinForms.js';

const Q = [
  { id: 'sleep', type: 'scale', label: 'Sleep?' },
  { id: 'hungry', type: 'yesno', label: 'Hungry?' },
  { id: 'wins', type: 'text', label: 'Wins?' },
];

describe('the built-in template', () => {
  it('is itself a valid form (so "use template" can never produce something the database rejects)', () => {
    expect(validateQuestions(TEMPLATE_QUESTIONS)).toBeNull();
    expect(TEMPLATE_QUESTIONS.length).toBeLessThanOrEqual(MAX_QUESTIONS);
  });
  it('offers sensible cadences and all three question types', () => {
    expect(CADENCES.map(c => c.days)).toEqual([7, 14, 30]);
    expect(QUESTION_TYPES.map(t => t.id)).toEqual(['scale', 'yesno', 'text']);
  });
});

describe('newQuestion', () => {
  it('picks an id nothing else uses, and the result validates once labelled', () => {
    expect(newQuestionId([])).toBe('q1');
    expect(newQuestionId([{ id: 'q1' }, { id: 'q2' }])).toBe('q3');
    expect(newQuestionId([{ id: 'q2' }])).toBe('q1');
    const added = newQuestion(TEMPLATE_QUESTIONS, 'text');
    expect(added).toMatchObject({ type: 'text', label: '' });
    expect(validateQuestions([...TEMPLATE_QUESTIONS, { ...added, label: 'x' }])).toBeNull();
  });
});

describe('validateQuestions (mirrors valid_checkin_questions)', () => {
  it('accepts a good set', () => {
    expect(validateQuestions(Q)).toBeNull();
    expect(validateQuestions(Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, type: 'text', label: 'x' })))).toBeNull();
  });
  it.each([
    [[], /at least one/],
    [null, /at least one/],
    [Array.from({ length: 13 }, (_, i) => ({ id: `q${i}`, type: 'text', label: 'x' })), /at most 12/],
    [['nope'], /Question 1 is malformed/],
    [[{ id: 'A b', type: 'text', label: 'x' }], /invalid id/],
    [[{ id: 'a', type: 'text', label: 'x' }, { id: 'a', type: 'text', label: 'y' }], /repeats/],
    [[{ id: 'a', type: 'essay', label: 'x' }], /unknown type/],
    [[{ id: 'a', type: 'text', label: '   ' }], /needs some text/],
    [[{ id: 'a', type: 'text', label: 'x'.repeat(201) }], /too long/],
  ])('rejects %j', (questions, message) => {
    expect(validateQuestions(questions)).toMatch(message);
  });
  it('names the question at fault', () => {
    expect(validateQuestions([{ id: 'a', type: 'text', label: 'ok' }, { id: 'b', type: 'text', label: '' }])).toMatch(/Question 2/);
  });
});

describe('cleanQuestions', () => {
  it('trims labels only', () => {
    expect(cleanQuestions([{ id: 'a', type: 'text', label: '  hi  ' }])).toEqual([{ id: 'a', type: 'text', label: 'hi' }]);
  });
});

describe('validateAnswers (mirrors valid_checkin_answers)', () => {
  const good = { sleep: 7, hungry: false, wins: 'yes' };
  it('accepts complete, well-typed answers, including empty text', () => {
    expect(validateAnswers(Q, good)).toBeNull();
    expect(validateAnswers(Q, { ...good, wins: '' })).toBeNull();
  });
  it.each([
    [{ ...good, sleep: 0 }], [{ ...good, sleep: 11 }], [{ ...good, sleep: 6.5 }], [{ ...good, sleep: '7' }], [{ ...good, sleep: null }],
    [{ ...good, hungry: 'yes' }], [{ ...good, hungry: null }], [{ ...good, wins: 5 }], [{ ...good, wins: 'x'.repeat(2001) }],
    [{ hungry: false, wins: '' }], [null], [[1, 2]],
  ])('rejects %j', (answers) => {
    expect(validateAnswers(Q, answers)).toEqual(expect.any(String));
  });
  it('says which question needs attention', () => {
    expect(validateAnswers(Q, { ...good, hungry: null })).toContain('Hungry?');
  });
  it('blank answers are not yet valid, except that empty text is fine', () => {
    const blank = blankAnswers(Q);
    expect(blank).toEqual({ sleep: null, hungry: null, wins: '' });
    expect(validateAnswers(Q, blank)).toEqual(expect.any(String));
  });
});

describe('dueState', () => {
  const day = 86400000;
  const created = '2026-09-01T00:00:00Z';
  const form = { is_active: true, cadence_days: 7, created_at: created };
  const now = new Date('2026-09-20T00:00:00Z').getTime();

  it('is due straight away when nothing has been submitted', () => {
    expect(dueState(form, null, now).due).toBe(true);
  });
  it('is not due until the cadence has passed since the last response', () => {
    const last = new Date(now - 3 * day).toISOString();
    const s = dueState(form, last, now);
    expect(s.due).toBe(false);
    expect(s.dueAt.getTime()).toBe(new Date(last).getTime() + 7 * day);
  });
  it('becomes due exactly on the day, and stays due', () => {
    expect(dueState(form, new Date(now - 7 * day).toISOString(), now).due).toBe(true);
    expect(dueState(form, new Date(now - 7 * day + 1000).toISOString(), now).due).toBe(false);
    expect(dueState(form, new Date(now - 30 * day).toISOString(), now).due).toBe(true);
  });
  it('honours a longer cadence', () => {
    expect(dueState({ ...form, cadence_days: 30 }, new Date(now - 10 * day).toISOString(), now).due).toBe(false);
  });
  it('is never due for an inactive or missing form', () => {
    expect(dueState({ ...form, is_active: false }, null, now)).toMatchObject({ due: false, inactive: true });
    expect(dueState(null, null, now).due).toBe(false);
  });
  it('accepts a Date or string for now', () => {
    expect(dueState(form, null, new Date(now)).due).toBe(true);
  });
});

describe('describeResponse / scaleTrend', () => {
  const response = (date, sleep) => ({
    created_at: date, questions_snapshot: Q, answers: { sleep, hungry: sleep > 5, wins: sleep > 5 ? ' great ' : '' },
  });
  it('pairs each snapshot question with a readable answer', () => {
    expect(describeResponse(response('2026-09-20T00:00:00Z', 8)).map(d => [d.label, d.text])).toEqual([['Sleep?', '8/10'], ['Hungry?', 'Yes'], ['Wins?', 'great']]);
    expect(describeResponse(response('2026-09-20T00:00:00Z', 2)).map(d => d.text)).toEqual(['2/10', 'No', '—']);
  });
  it('copes with missing answers and snapshots', () => {
    expect(describeResponse({ questions_snapshot: Q, answers: {} }).map(d => d.text)).toEqual(['—', '—', '—']);
    expect(describeResponse({ answers: {} })).toEqual([]);
  });
  it('lists a scale question\'s answers oldest first, across responses, skipping ones without it', () => {
    const rs = [response('2026-09-20T00:00:00Z', 8), response('2026-09-06T00:00:00Z', 4), { created_at: '2026-09-13T00:00:00Z', questions_snapshot: [{ id: 'x', type: 'text', label: 'Other' }], answers: { x: 'hi' } }];
    expect(scaleTrend(rs, 'Sleep?')).toEqual([4, 8]);
    expect(scaleTrend(rs, 'Nope')).toEqual([]);
  });
});
