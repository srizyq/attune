import { useState } from 'react';
import { useMyCheckinForms } from '../hooks/useCheckinForms';
import { useVoiceTranscription } from '../hooks/useVoiceTranscription';
import { blankAnswers, dueState, validateAnswers, MAX_TEXT_ANSWER } from '../lib/checkinForms';
import VoiceMicButton from './VoiceMicButton';

const card = { background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 16, padding: 24, marginBottom: 20 };
const heading = { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-primary)' };
const fmt = (d) => new Date(d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

// Its own component (not inlined in the questions.map below) so each text
// question gets its own useVoiceTranscription call — one recording/
// transcribing state per question, not one shared across however many text
// questions a form happens to have.
function TextAnswerField({ labelledBy, value, onChange }) {
  const { recording, transcribing, error, start, stop } = useVoiceTranscription((text) => {
    onChange(value.trim() ? `${value.trim()} ${text}` : text);
  });
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 5 }}>
        <VoiceMicButton recording={recording} transcribing={transcribing} onStart={start} onStop={stop} title="Speak your answer" />
      </div>
      <textarea aria-labelledby={labelledBy} value={value} maxLength={MAX_TEXT_ANSWER} rows={3} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
    </>
  );
}

function FormCard({ form, onSubmit }) {
  const [answers, setAnswers] = useState(() => blankAnswers(form.questions));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const state = dueState(form, form.last_response_at);
  const coach = form.trainer?.name || 'Your coach';

  const set = (id, value) => setAnswers(prev => ({ ...prev, [id]: value }));
  const submit = async () => {
    const problem = validateAnswers(form.questions, answers);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(form.id, answers);
      setDone(true);
    } catch (err) {
      setError(err.message || "Couldn't send that — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div style={card}>
        <div style={heading}>{form.title}</div>
        <p role="status" style={{ color: 'var(--accent)', fontSize: 13, margin: '10px 0 0' }}>Sent to {coach} — thanks!</p>
      </div>
    );
  }

  if (!state.due) {
    return (
      <div style={card}>
        <div style={heading}>{form.title}</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '8px 0 0' }}>
          Submitted {fmt(form.last_response_at)}. Your next one from {coach} is due {fmt(state.dueAt)}.
        </p>
      </div>
    );
  }

  return (
    <div style={{ ...card, borderColor: 'var(--border-active)' }}>
      <div style={heading}>{form.title}</div>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '4px 0 18px' }}>{coach} would like an update.</p>

      {form.questions.map(item => (
        <div key={item.id} style={{ marginBottom: 18 }}>
          <div id={`q-${form.id}-${item.id}`} style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 }}>{item.label}</div>
          {item.type === 'scale' && (
            <div role="group" aria-labelledby={`q-${form.id}-${item.id}`} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => set(item.id, n)} aria-pressed={answers[item.id] === n} className="btn-press"
                  style={{ width: 34, height: 34, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
                    background: answers[item.id] === n ? 'var(--accent)' : 'var(--bg-primary)', border: `1px solid ${answers[item.id] === n ? 'var(--accent)' : 'var(--border-default)'}`, color: answers[item.id] === n ? 'var(--accent-contrast)' : 'var(--text-secondary)' }}>{n}</button>
              ))}
            </div>
          )}
          {item.type === 'yesno' && (
            <div role="group" aria-labelledby={`q-${form.id}-${item.id}`} style={{ display: 'flex', gap: 8 }}>
              {[['Yes', true], ['No', false]].map(([label, value]) => (
                <button key={label} onClick={() => set(item.id, value)} aria-pressed={answers[item.id] === value} className="btn-press"
                  style={{ padding: '8px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
                    background: answers[item.id] === value ? 'var(--accent)' : 'var(--bg-primary)', border: `1px solid ${answers[item.id] === value ? 'var(--accent)' : 'var(--border-default)'}`, color: answers[item.id] === value ? 'var(--accent-contrast)' : 'var(--text-secondary)' }}>{label}</button>
              ))}
            </div>
          )}
          {item.type === 'text' && (
            <TextAnswerField labelledBy={`q-${form.id}-${item.id}`} value={answers[item.id]} onChange={v => set(item.id, v)} />
          )}
        </div>
      ))}

      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 12px' }}>{error}</p>}
      <button onClick={submit} disabled={busy} className="btn-press" style={{ padding: '10px 20px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: 'var(--accent-contrast)', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {busy ? 'Sending…' : 'Send to coach'}
      </button>
    </div>
  );
}

// The check-in form(s) a coach has asked the signed-in client to fill in —
// due ones open, otherwise when the next is due. Renders nothing when there's
// no form (or before the database update is applied).
export default function CoachCheckinCard() {
  const { supported, forms, submit } = useMyCheckinForms();
  if (!supported || forms.length === 0) return null;
  return <>{forms.map(f => <FormCard key={f.id} form={f} onSubmit={submit} />)}</>;
}
