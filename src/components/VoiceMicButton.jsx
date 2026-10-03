// The spinner/stop/mic state machine from PhotoScanModal's correction box,
// pulled out so every other text field that wants voice input (coach notes,
// check-in answers, menu scan's own correction box) gets the exact same
// look and feel instead of a one-off re-implementation each time. Each
// caller still owns its own useVoiceTranscription(onResult) call — this
// component is purely the three-state button, not the recording logic.
export default function VoiceMicButton({ recording, transcribing, onStart, onStop, title = 'Speak instead of typing' }) {
  if (transcribing) {
    return (
      <div
        aria-label="Transcribing…"
        style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid var(--text-hint)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
      />
    );
  }
  if (recording) {
    return (
      <button
        type="button"
        onClick={onStop}
        title="Stop recording"
        aria-label="Stop recording"
        className="hit-slop"
        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0, display: 'flex', animation: 'pulse 1.2s ease-in-out infinite' }}
      >
        <i aria-hidden="true" className="ti ti-player-stop-filled" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onStart}
      className="hit-slop"
      title={title}
      aria-label={title}
      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0, display: 'flex' }}
    >
      <i aria-hidden="true" className="ti ti-microphone" />
    </button>
  );
}
