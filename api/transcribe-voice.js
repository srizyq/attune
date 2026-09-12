// Serverless proxy for voice-to-text food search — records audio in the
// browser, transcribes it here via OpenAI's Whisper API, and returns the
// text for the client to drop straight into the search box. The API key
// must never reach the browser, same reasoning as recognize-food.js.
//
// Requires OPENAI_API_KEY to be set (not currently in this project's env
// — a different provider than the Anthropic key already configured,
// since transcription isn't a Claude API capability).

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!supabaseUrl || !serviceKey || !openaiKey) {
    res.status(500).json({ error: 'Voice search is not fully configured' });
    return;
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  const { audio, mimeType } = req.body || {};
  if (!audio) {
    res.status(400).json({ error: 'Missing audio' });
    return;
  }

  try {
    const buffer = Buffer.from(audio, 'base64');
    const ext = (mimeType || '').includes('mp4') ? 'mp4' : (mimeType || '').includes('ogg') ? 'ogg' : 'webm';
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType || 'audio/webm' }), `recording.${ext}`);
    form.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Whisper transcription failed:', response.status, errText);
      res.status(502).json({ error: 'Voice search is temporarily unavailable.' });
      return;
    }

    const data = await response.json();
    res.status(200).json({ text: data.text || '' });
  } catch (err) {
    console.error('Voice search error:', err);
    res.status(502).json({ error: 'Voice search is temporarily unavailable.' });
  }
}
