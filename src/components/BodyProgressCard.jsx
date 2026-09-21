import { useRef, useState } from 'react';
import { useProfile } from '../hooks/useProfile';
import { useBodyMeasurements, useProgressPhotos } from '../hooks/useBodyProgress';
import { KINDS, formatMeasurement, kindLabel, latestByKind, unitFor, validateImageFile } from '../lib/bodyProgress';
import { todayLocalDate } from '../lib/patterns';
import PhotoGallery from './PhotoGallery';

const input = { padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none' };
const heading = { fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' };

// The client's own body-measurement and progress-photo log, on the Progress
// page under weight. Visible only to them and, if they've connected one, their
// coach (see the consent screen). Renders nothing until the database update
// that creates its tables has been applied.
export default function BodyProgressCard() {
  const { profile } = useProfile();
  const measurements = useBodyMeasurements();
  const photos = useProgressPhotos();
  const today = todayLocalDate();

  const [kind, setKind] = useState('waist');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const fileRef = useRef(null);

  if (!measurements.supported && !photos.supported) return null;

  const unit = unitFor(kind, profile?.unit);
  const number = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(number) && number > 0 && (kind !== 'body_fat' || number < 75);

  const saveMeasurement = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await measurements.save({ date, kind, value: number, unit });
      setValue('');
    } catch (err) {
      setError(err.message || 'Couldn’t save that — try again.');
    } finally {
      setSaving(false);
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) { setPhotoError(problem); return; }
    setUploading(true);
    setPhotoError(null);
    try {
      await photos.add(file, today);
    } catch (err) {
      setPhotoError(err.message || 'Couldn’t upload that photo — try again.');
    } finally {
      setUploading(false);
    }
  };

  const latest = latestByKind(measurements.rows);

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <div style={{ ...heading, marginBottom: 4 }}>Body &amp; photos</div>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 16px', lineHeight: 1.5 }}>
        Only you{profile ? ' — and your coach, if you’re connected to one —' : ''} can see these.
      </p>

      {measurements.supported && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <div>
              <label htmlFor="body-kind" style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Measurement</label>
              <select id="body-kind" value={kind} onChange={e => setKind(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="body-value" style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Value ({unit === 'pct' ? '%' : unit})</label>
              <input id="body-value" type="number" inputMode="decimal" min="0" step="0.1" value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveMeasurement(); }} style={{ ...input, width: 100 }} />
            </div>
            <div>
              <label htmlFor="body-date" style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Date</label>
              <input id="body-date" type="date" value={date} max={today} onChange={e => setDate(e.target.value || today)} style={input} />
            </div>
            <button onClick={saveMeasurement} disabled={!valid || saving} className="btn-press" style={{ padding: '9px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", opacity: !valid || saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 12px' }}>{error}</p>}

          {latest.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {latest.map(({ kind: k, latest: l, delta }) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-default)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{kindLabel(k)} <span style={{ color: 'var(--text-hint)', fontSize: 11 }}>· {new Date(`${l.logged_date}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span></span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {formatMeasurement(l.value, l.unit)}
                    {delta != null && delta !== 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 12, marginLeft: 8 }}>{delta > 0 ? '+' : '−'}{Math.abs(delta)}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {photos.supported && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
            <div style={heading}>Progress photos</div>
            <label style={{ padding: '7px 14px', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 7, color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: uploading ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", opacity: uploading ? 0.6 : 1 }}>
              {uploading ? 'Uploading…' : '+ Add photo'}
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} disabled={uploading} aria-label="Add a progress photo" style={{ display: 'none' }} />
            </label>
          </div>
          {photoError && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 12px' }}>{photoError}</p>}
          <PhotoGallery photos={photos.photos} urls={photos.urls} onDelete={photos.remove} emptyText="No photos yet — add one to see your progress over time." />
        </div>
      )}
    </div>
  );
}
