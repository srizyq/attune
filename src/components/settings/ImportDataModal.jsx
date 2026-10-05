import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useProfile } from '../../hooks/useProfile';
import { getFoodLogDatesInRange, insertFoodLogRows, insertWeightLogRows, deleteImportedFood, deleteImportedWeights } from '../../lib/db';
import { todayLocalDate } from '../../lib/patterns';
import { readImportFiles } from '../../lib/importers/readFiles';
import { parseImportFiles } from '../../lib/importers/diary';
import { planImport, runImport, MAX_ENTRIES } from '../../lib/importers/run';
import { saveLastImport, loadLastImport, clearLastImport, undoImport } from '../../lib/importers/undo';
import FormRow from '../FormRow';
import { SettingsModal, Card, SectionLabel } from './primitives';

// Bring a food diary and weight history in from another tracker: pick the
// export (a .zip or .csv files), see exactly what was understood, then import.
// Everything is read on this device; only the confirmed rows go to the account.

const dayLabel = (ymd) => new Date(`${ymd}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const muted = { color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.6 };

// "Undo this import": a two-step confirm, then removes what the import added.
function UndoSection({ batch, undo, onAsk, onCancel, onConfirm, title }) {
  const parts = [
    batch.foodAdded > 0 && plural(batch.foodAdded, 'food entry', 'food entries'),
    batch.weightAdded > 0 && plural(batch.weightAdded, 'weigh-in'),
  ].filter(Boolean).join(' and ');
  return (
    <Card style={{ marginBottom: 16 }}>
      <SectionLabel>{title}</SectionLabel>
      <p style={{ ...muted, margin: '0 0 12px' }}>
        {undo.phase === 'confirm' || undo.phase === 'working'
          ? `This removes the ${parts} that import added — including any you've edited since. Anything you logged yourself, and entries copied from them to other days, stay.`
          : `${parts} came in from that import. Changed your mind? You can take it back out.`}
      </p>
      {undo.error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 10px' }}>{undo.error}</p>}
      <FormRow>
        {undo.phase === 'idle' && <FormRow.Button icon="ti-arrow-back-up" danger onClick={onAsk}>Undo this import</FormRow.Button>}
        {(undo.phase === 'confirm' || undo.phase === 'working') && (
          <>
            <FormRow.Button icon="ti-trash" danger disabled={undo.phase === 'working'} onClick={onConfirm}>{undo.phase === 'working' ? 'Removing…' : 'Yes, remove them'}</FormRow.Button>
            <FormRow.Button disabled={undo.phase === 'working'} onClick={onCancel}>Keep them</FormRow.Button>
          </>
        )}
      </FormRow>
    </Card>
  );
}

export default function ImportDataModal({ onClose, closing }) {
  const { user } = useAuth();
  const { profile } = useProfile();
  const inputRef = useRef(null);
  const [step, setStep] = useState('pick'); // pick | reading | preview | importing | done
  const [rawFiles, setRawFiles] = useState([]);
  const [problems, setProblems] = useState([]);
  const [dateOrder, setDateOrder] = useState('auto');
  const [skipExisting, setSkipExisting] = useState(true);
  const [existing, setExisting] = useState({ status: 'idle', days: new Set(), error: null }); // idle | loading | ready | error
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  // The most recent import on this device (so it can still be undone after the
  // screen was closed), and the state of an undo in progress.
  const [lastImport, setLastImport] = useState(() => loadLastImport(user?.id));
  const [undo, setUndo] = useState({ phase: 'idle', error: null, result: null }); // idle | confirm | working | done

  const weightUnit = profile?.unit === 'imperial' ? 'lb' : 'kg';
  const parsed = useMemo(
    () => (rawFiles.length ? parseImportFiles(rawFiles, { today: todayLocalDate(), defaultWeightUnit: weightUnit, dateOrder }) : null),
    [rawFiles, weightUnit, dateOrder],
  );

  // Which of the file's days already have food in the account.
  const first = parsed?.firstDate;
  const last = parsed?.lastDate;
  useEffect(() => {
    if (step !== 'preview' || !user || !first) return undefined;
    let cancelled = false;
    // Loading state is set by whatever moved us into the preview (see handleFiles),
    // so a change of day order below just refreshes the list quietly.
    getFoodLogDatesInRange(user.id, first, last)
      .then((days) => { if (!cancelled) setExisting({ status: 'ready', days, error: null }); })
      .catch((err) => {
        console.error('Failed to check existing days:', err);
        if (!cancelled) setExisting({ status: 'error', days: new Set(), error: "Couldn't check which days you've already logged — try again." });
      });
    return () => { cancelled = true; };
  }, [step, user, first, last]);

  async function handleFiles(fileList) {
    setStep('reading');
    setResult(null);
    setUndo({ phase: 'idle', error: null, result: null });
    setDateOrder('auto');
    setExisting({ status: 'loading', days: new Set(), error: null });
    try {
      const { files, problems: readProblems } = await readImportFiles(fileList);
      setRawFiles(files);
      setProblems(readProblems);
      setStep(files.length ? 'preview' : 'pick');
    } catch (err) {
      console.error('Failed to read import files:', err);
      setRawFiles([]);
      setProblems(["Couldn't read those files — try again."]);
      setStep('pick');
    }
  }

  const plan = parsed ? planImport(parsed, existing.days, skipExisting) : null;
  const nothing = parsed && parsed.entries.length === 0 && parsed.weights.length === 0;
  const tooBig = parsed && parsed.entries.length > MAX_ENTRIES;
  const canImport = step === 'preview' && parsed && !nothing && !tooBig && existing.status === 'ready' && (plan.entries.length > 0 || parsed.weights.length > 0);

  async function handleImport() {
    setStep('importing');
    setProgress({ done: 0, total: plan.entries.length + parsed.weights.length });
    const res = await runImport({
      userId: user.id, parsed, existingDays: existing.days, skipExistingDays: skipExisting,
      onProgress: setProgress, db: { insertFoodLogRows, insertWeightLogRows },
    });
    setResult(res);
    setUndo({ phase: 'idle', error: null, result: null });
    if (res.batch) {
      saveLastImport(user.id, res.batch);
      setLastImport(loadLastImport(user.id) || { ...res.batch, at: new Date().toISOString() });
    }
    setStep('done');
  }

  async function handleUndo(batch) {
    setUndo({ phase: 'working', error: null, result: null });
    const res = await undoImport({ userId: user.id, batch, db: { deleteImportedFood, deleteImportedWeights } });
    if (res.error) {
      // Some may have gone: say so, and keep the option to try again.
      setUndo({ phase: 'confirm', error: `${res.error}${res.foodRemoved + res.weightRemoved > 0 ? ` (${(res.foodRemoved + res.weightRemoved).toLocaleString()} removed before that)` : ''}. Try again.`, result: null });
      return;
    }
    clearLastImport(user.id);
    setLastImport(null);
    setUndo({ phase: 'done', error: null, result: res });
  }

  function startOver() {
    setRawFiles([]);
    setProblems([]);
    setStep('pick');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <SettingsModal title="Import from another app" onClose={onClose} closing={closing}>
      <input
        ref={inputRef} type="file" accept=".csv,.tsv,.txt,.zip,text/csv,application/zip" multiple hidden
        data-testid="import-file-input"
        onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); }}
      />

      {undo.phase === 'done' && undo.result && (
        <Card style={{ marginBottom: 16 }}>
          <SectionLabel>Import undone</SectionLabel>
          <p style={{ margin: '0 0 4px', color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>
            {plural(undo.result.foodRemoved, 'food entry', 'food entries')} removed
            {undo.result.weightRemoved > 0 ? `, ${plural(undo.result.weightRemoved, 'weigh-in')}` : ''}
          </p>
          <p style={{ ...muted, margin: 0 }}>Your diary is back to how it was before you imported.</p>
        </Card>
      )}

      {(step === 'pick' || step === 'reading') && (
        <>
          {lastImport && undo.phase !== 'done' && (
            <UndoSection
              title={`Last import — ${new Date(lastImport.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
              batch={lastImport} undo={undo}
              onAsk={() => setUndo({ phase: 'confirm', error: null, result: null })}
              onCancel={() => setUndo({ phase: 'idle', error: null, result: null })}
              onConfirm={() => handleUndo(lastImport)}
            />
          )}
          <Card style={{ marginBottom: 16 }}>
            <SectionLabel>Bring your history with you</SectionLabel>
            <p style={{ ...muted, margin: '0 0 12px' }}>
              Use the "export my data" option in your old app (usually on its website's settings), then choose the file or zip you get — MyFitnessPal, Cronometer, Lose It and most similar apps work. Food diaries and weight history come across.
            </p>
            <p style={{ ...muted, margin: '0 0 16px' }}>
              The file is read on your device. You'll see what was found before anything is saved.
            </p>
            <FormRow>
              <FormRow.Button icon="ti-file-import" primary disabled={step === 'reading'} onClick={() => inputRef.current?.click()}>
                {step === 'reading' ? 'Reading…' : 'Choose file or zip'}
              </FormRow.Button>
            </FormRow>
            {problems.length > 0 && (
              <div role="alert" style={{ marginTop: 12 }}>
                {problems.map((p) => <p key={p} style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 4px' }}>{p}</p>)}
              </div>
            )}
          </Card>
          <p style={{ ...muted, margin: 0, color: 'var(--text-hint)' }}>
            Imported foods come in as one serving per row, with the calories and macros your old app recorded, and are marked as imported. Exercise, recipes and goals aren't imported.
          </p>
        </>
      )}

      {step === 'preview' && parsed && (
        <>
          <Card style={{ marginBottom: 16 }}>
            <SectionLabel>What we found</SectionLabel>
            {nothing ? (
              <p style={{ ...muted, color: 'var(--text-secondary)', margin: 0 }}>
                Nothing we could import. We look for a date column plus calories (a food diary) or a weight column (a weight log).
              </p>
            ) : (
              <>
                {parsed.entries.length > 0 && (
                  <p style={{ margin: '0 0 6px', color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>
                    {plural(parsed.entries.length, 'food entry', 'food entries')} across {plural(parsed.days.length, 'day')}
                  </p>
                )}
                {parsed.entries.length > 0 && <p style={{ ...muted, margin: '0 0 10px' }}>{dayLabel(parsed.firstDate)} – {dayLabel(parsed.lastDate)}</p>}
                {parsed.weights.length > 0 && (
                  <p style={{ margin: '0 0 6px', color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>{plural(parsed.weights.length, 'weigh-in')}</p>
                )}
              </>
            )}
            <div style={{ marginTop: 10 }}>
              {parsed.files.map((f) => (
                <p key={f.name} style={{ ...muted, margin: '0 0 2px' }}>
                  <i className={`ti ${f.kind === 'ignored' ? 'ti-minus' : 'ti-check'}`} aria-hidden="true" style={{ marginRight: 6, color: f.kind === 'ignored' ? 'var(--text-hint)' : 'var(--accent)' }} />
                  {f.name} — {f.kind === 'ignored' ? 'not a food or weight file, left out' : `${f.source}, ${plural(f.rows, 'row')}`}
                </p>
              ))}
            </div>
            {problems.length > 0 && problems.map((p) => <p key={p} style={{ color: 'var(--danger)', fontSize: 12, margin: '8px 0 0' }}>{p}</p>)}
          </Card>

          {parsed.skipped.length > 0 && (
            <Card style={{ marginBottom: 16 }}>
              <SectionLabel>Left out</SectionLabel>
              {parsed.skipped.map((s) => <p key={s.reason} style={{ ...muted, margin: '0 0 2px' }}>{plural(s.count, 'row')}: {s.reason}</p>)}
            </Card>
          )}

          {!nothing && !tooBig && (
            <Card style={{ marginBottom: 16 }}>
              <SectionLabel>Options</SectionLabel>
              {parsed.entries.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 6 }}>
                  <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} style={{ width: 24, height: 24, flexShrink: 0, margin: 0, accentColor: 'var(--accent)' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Skip days that already have food in Attune
                    <span style={{ display: 'block', ...muted, color: 'var(--text-hint)' }}>
                      {existing.status === 'loading' && 'Checking your diary…'}
                      {existing.status === 'ready' && (skipExisting
                        ? (plan.skippedDays > 0 ? `${plural(plan.skippedDays, 'day')} will be left alone, so nothing is doubled up.` : 'None of these days have food yet.')
                        : `Imported entries will be added alongside anything already logged — ${plural(planImport(parsed, existing.days, true).skippedDays, 'day')} could end up doubled.`)}
                      {existing.status === 'error' && existing.error}
                    </span>
                  </span>
                </label>
              )}
              {parsed.weights.length > 0 && (
                <p style={{ ...muted, margin: '8px 0 0' }}>Dates that already have a weigh-in keep what's there.</p>
              )}
              {parsed.dateOrderGuessed && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ ...muted, margin: '0 0 6px' }}>Dates like 05/03/2026 could be read two ways. We've assumed day first:</p>
                  <select
                    aria-label="Date order" value={parsed.dateOrder} onChange={(e) => setDateOrder(e.target.value)}
                    style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}
                  >
                    <option value="dmy">Day / Month / Year (5 March)</option>
                    <option value="mdy">Month / Day / Year (3 May)</option>
                  </select>
                </div>
              )}
            </Card>
          )}

          {tooBig && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 16px' }}>That's more than {MAX_ENTRIES.toLocaleString()} entries — too many to import at once. Split the export by date range and import it in parts.</p>}

          <FormRow>
            {!nothing && (
              <FormRow.Button icon="ti-download" primary disabled={!canImport} onClick={handleImport}>
                {existing.status === 'loading' ? 'Checking…' : `Import ${[plan.entries.length > 0 && plural(plan.entries.length, 'entry', 'entries'), parsed.weights.length > 0 && plural(parsed.weights.length, 'weigh-in')].filter(Boolean).join(' and ') || 'nothing new'}`}
              </FormRow.Button>
            )}
            <FormRow.Button onClick={startOver}>Choose different files</FormRow.Button>
          </FormRow>
        </>
      )}

      {step === 'importing' && (
        <Card style={{ marginBottom: 0 }}>
          <SectionLabel>Importing…</SectionLabel>
          <div style={{ height: 8, borderRadius: 99, background: 'var(--border-default)', overflow: 'hidden', marginBottom: 10 }} role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div style={{ height: '100%', width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: 'var(--accent)', transition: 'width 0.2s' }} />
          </div>
          <p style={{ ...muted, margin: 0 }}>{progress.done.toLocaleString()} of {progress.total.toLocaleString()} — keep this open until it finishes.</p>
        </Card>
      )}

      {step === 'done' && result && (
        <>
          {undo.phase !== 'done' && (
            <Card style={{ marginBottom: 16 }}>
              <SectionLabel>{result.error ? 'Import stopped' : 'Import complete'}</SectionLabel>
              {result.error && (
                <p role="alert" style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 10px', lineHeight: 1.5 }}>
                  {result.error} What was saved before that is still there; choose the same files again to fill in the rest (days already saved are skipped).
                </p>
              )}
              <p style={{ margin: '0 0 4px', color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>
                {plural(result.foodImported, 'food entry', 'food entries')} added across {plural(result.daysImported, 'day')}
              </p>
              {result.skippedDays > 0 && <p style={{ ...muted, margin: '0 0 4px' }}>{plural(result.skippedDays, 'day')} left alone — already in your diary.</p>}
              {(result.weightImported > 0 || result.weightSkipped > 0) && (
                <p style={{ ...muted, margin: 0 }}>
                  {plural(result.weightImported, 'weigh-in')} added{result.weightSkipped > 0 ? `, ${plural(result.weightSkipped, 'date')} already had one` : ''}.
                </p>
              )}
            </Card>
          )}
          {result.batch && undo.phase !== 'done' && (
            <UndoSection
              title="Not what you expected?"
              batch={result.batch} undo={undo}
              onAsk={() => setUndo({ phase: 'confirm', error: null, result: null })}
              onCancel={() => setUndo({ phase: 'idle', error: null, result: null })}
              onConfirm={() => handleUndo(result.batch)}
            />
          )}
          <FormRow>
            <FormRow.Button primary onClick={onClose}>Done</FormRow.Button>
            {result.error && <FormRow.Button onClick={startOver}>Choose files again</FormRow.Button>}
          </FormRow>
        </>
      )}
    </SettingsModal>
  );
}
