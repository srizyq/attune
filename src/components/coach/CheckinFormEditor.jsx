import { useEffect, useState } from 'react';
import { Card, SectionLabel } from './shared';
import { fieldStyle, labelStyle } from './constants';
import { CADENCES, MAX_QUESTIONS, MAX_LABEL, MAX_TITLE, QUESTION_TYPES, TEMPLATE_QUESTIONS, cleanQuestions, newQuestion, validateQuestions } from '../../lib/checkinForms';

const iconBtn = { background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 15, padding: 4, lineHeight: 1 };
const ghost = { padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" };

// The coach's weekly check-in form for one client: a handful of questions
// (1–10 scales, yes/no, or written), a schedule, and an on/off switch. The
// client sees it on their Coach tab and is nudged by a push when it's due.
export default function CheckinFormEditor({ clientData, admin }) {
  const { supported, form, loading, save, remove } = admin;
  const [title, setTitle] = useState('Weekly check-in');
  const [cadence, setCadence] = useState(7);
  const [isActive, setIsActive] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  // Load the saved form into the editor whenever it (or the client) changes.
  useEffect(() => {
    setTitle(form?.title || 'Weekly check-in');
    setCadence(form?.cadence_days || 7);
    setIsActive(form ? form.is_active : true);
    setQuestions(form?.questions || []);
    setError(null);
    // (not setSaved here: reloading after a save must not clear the "Saved" flag
    // the save just set — edits clear it themselves.)
  }, [form]);

  if (!supported && !loading) {
    return (
      <Card>
        <SectionLabel icon="ti-clipboard-check">Check-in form</SectionLabel>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Check-in forms need the latest database update, which hasn't been applied yet.</p>
      </Card>
    );
  }

  const edit = (fn) => { setQuestions(fn); setSaved(false); };
  const update = (id, patch) => edit(qs => qs.map(x => (x.id === id ? { ...x, ...patch } : x)));
  const move = (index, delta) => edit(qs => {
    const next = [...qs];
    const target = index + delta;
    if (target < 0 || target >= next.length) return qs;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  const handleSave = async () => {
    const cleaned = cleanQuestions(questions);
    const problem = validateQuestions(cleaned) || (title.trim() ? null : 'Give the check-in a title.');
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    try {
      await save({ title: title.trim(), questions: cleaned, cadenceDays: cadence, isActive });
      setSaved(true);
    } catch (err) {
      setError(err.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remove this check-in for ${clientData.name || 'this client'}? Their past answers are kept.`)) return;
    setError(null);
    try { await remove(form.id); } catch (err) { setError(err.message || "Couldn't remove it — try again."); }
  };

  return (
    <Card>
      <SectionLabel icon="ti-clipboard-check">Check-in form</SectionLabel>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '-6px 0 16px', lineHeight: 1.5 }}>
        {clientData.name || 'Your client'} sees this on their Coach tab and gets a nudge when it's due.
      </p>

      {questions.length === 0 && !form && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => edit(() => TEMPLATE_QUESTIONS.map(x => ({ ...x })))} className="btn-press" style={{ ...ghost, color: 'var(--accent)' }}>Start from the standard weekly check-in</button>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="checkin-title" style={labelStyle}>Title</label>
        <input id="checkin-title" value={title} maxLength={MAX_TITLE} onChange={e => { setTitle(e.target.value); setSaved(false); }} style={fieldStyle} />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <label htmlFor="checkin-cadence" style={labelStyle}>How often</label>
          <select id="checkin-cadence" value={cadence} onChange={e => { setCadence(Number(e.target.value)); setSaved(false); }} style={{ ...fieldStyle, width: 'auto', cursor: 'pointer' }}>
            {CADENCES.map(c => <option key={c.days} value={c.days}>{c.label}</option>)}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13, alignSelf: 'flex-end', paddingBottom: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={isActive} onChange={e => { setIsActive(e.target.checked); setSaved(false); }} />
          Send to {clientData.name || 'client'}
        </label>
      </div>

      <ol style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
        {questions.map((item, i) => (
          <li key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border-default)' }}>
            <span style={{ color: 'var(--text-hint)', fontSize: 12, width: 18, paddingTop: 10, flexShrink: 0 }}>{i + 1}.</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input aria-label={`Question ${i + 1}`} value={item.label} maxLength={MAX_LABEL} placeholder="Ask something…" onChange={e => update(item.id, { label: e.target.value })} style={{ ...fieldStyle, marginBottom: 6 }} />
              <select aria-label={`Question ${i + 1} type`} value={item.type} onChange={e => update(item.id, { type: e.target.value })} style={{ ...fieldStyle, width: 'auto', fontSize: 12, cursor: 'pointer' }}>
                {QUESTION_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move question ${i + 1} up`} className="btn-press" style={{ ...iconBtn, opacity: i === 0 ? 0.3 : 1 }}><i className="ti ti-chevron-up" /></button>
              <button onClick={() => move(i, 1)} disabled={i === questions.length - 1} aria-label={`Move question ${i + 1} down`} className="btn-press" style={{ ...iconBtn, opacity: i === questions.length - 1 ? 0.3 : 1 }}><i className="ti ti-chevron-down" /></button>
            </div>
            <button onClick={() => edit(qs => qs.filter(x => x.id !== item.id))} aria-label={`Remove question ${i + 1}`} className="btn-press" style={{ ...iconBtn, paddingTop: 10 }}><i className="ti ti-trash" /></button>
          </li>
        ))}
      </ol>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => edit(qs => [...qs, newQuestion(qs)])} disabled={questions.length >= MAX_QUESTIONS} className="btn-press" style={{ ...ghost, opacity: questions.length >= MAX_QUESTIONS ? 0.5 : 1 }}>+ Add question</button>
        <button onClick={handleSave} disabled={saving} className="btn-press" style={{ padding: '8px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {saving ? 'Saving…' : form ? 'Save changes' : 'Save check-in'}
        </button>
        {form && <button onClick={handleDelete} className="btn-press" style={{ ...ghost, border: 'none', color: 'var(--text-muted)' }}>Remove</button>}
        {saved && <span role="status" style={{ color: 'var(--accent)', fontSize: 12 }}>Saved</span>}
      </div>
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '10px 0 0' }}>{error}</p>}
    </Card>
  );
}
