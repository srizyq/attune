import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Records from the mic and sends the clip to api/transcribe-voice.js
// (OpenAI Whisper), handing the transcribed text to onResult. Shared by
// every mic button in the app — Food Search's voice search originated this
// record/upload plumbing; Photo Scan's correction box reuses it as-is
// rather than duplicating it.
export function useVoiceTranscription(onResult) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState(null);
  const recorderRef = useRef(null);

  async function transcribe(blob) {
    setTranscribing(true);
    try {
      const base64 = await blobToBase64(blob);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/transcribe-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ audio: base64, mimeType: blob.type }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Couldn't transcribe that.");
      if (data.text?.trim()) {
        setError(null);
        onResult(data.text.trim());
      } else {
        setError("Didn't catch that — try again.");
      }
    } catch (err) {
      console.error('Voice transcription error:', err);
      setError(err.message || "Couldn't understand that — try again or type instead.");
    } finally {
      setTranscribing(false);
    }
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        transcribe(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      console.error('Microphone access error:', err);
      setError("Couldn't access your microphone — check your browser's permission settings.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  return { recording, transcribing, error, start, stop };
}
