import { supabase } from './supabase';
import { fetchWithTimeout } from './http';
import { resizeToJpeg } from './resizeImage';
import { getRecentErrors } from './recentErrors';
import { APP_VERSION } from './appVersion';
import { lastScreen } from './lastScreen';

// "Report a problem": the form's submit, and what the admin page reads and does.

export const MIN_LENGTH = 5;
export const MAX_LENGTH = 2000;

export function friendlyReportError(err) {
  const msg = String(err?.message || '');
  if (/report_rate_limited/.test(msg)) return 'You\'ve sent a few reports today. Try again tomorrow.';
  if (/report_invalid/.test(msg)) return `Write ${MIN_LENGTH} to ${MAX_LENGTH.toLocaleString()} characters.`;
  if (/Could not read that image/.test(msg)) return 'That image couldn\'t be read. Try another.';
  return 'Couldn\'t send that. Try again.';
}

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

// The server emails the admin and files the issue. The report is already saved,
// so a failure here must never make the person think theirs was lost.
async function announce(reportId, kind) {
  try {
    const res = await fetchWithTimeout('/api/notify-trainer-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ report: kind, reportId }),
      timeoutMs: 15000,
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

/** Saves a report (uploading the screenshot first, if any) and returns its id. */
export async function submitReport({ message, contactOk = true, screenshot = null, userId }) {
  let screenshotPath = null;
  if (screenshot) {
    const blob = await resizeToJpeg(screenshot);
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from('report-screenshots').upload(path, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
    screenshotPath = path;
  }
  const { data, error } = await supabase.rpc('submit_app_report', {
    p_message: message,
    p_contact_ok: !!contactOk,
    p_screen: lastScreen() || window.location.pathname,
    p_app_version: APP_VERSION,
    p_user_agent: navigator.userAgent,
    p_viewport: `${window.innerWidth}x${window.innerHeight}`,
    p_errors: getRecentErrors(),
    p_screenshot_path: screenshotPath,
  });
  if (error) throw error;
  announce(data, 'created'); // not awaited: the person is done once it's saved
  return data;
}

// ── Admin ───────────────────────────────────────────────────────────────────
export async function isAppAdmin() {
  const { data, error } = await supabase.rpc('is_app_admin');
  if (error) return false;
  return data === true;
}

export async function listReports(limit = 100) {
  const { data, error } = await supabase.from('app_reports').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function updateReport(id, fields) {
  const { data, error } = await supabase.from('app_reports').update(fields).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function askClaudeToFix(id) {
  const res = await announce(id, 'claude');
  if (!res?.ok) throw new Error('Could not start Claude');
  return res;
}

export async function screenshotUrl(path) {
  const { data, error } = await supabase.storage.from('report-screenshots').createSignedUrl(path, 600);
  if (error) throw error;
  return data.signedUrl;
}

export const STATUSES = [
  { id: 'new', label: 'New' },
  { id: 'claude_working', label: 'Claude is working' },
  { id: 'pr_open', label: 'Fix ready to review' },
  { id: 'fixed', label: 'Fixed' },
  { id: 'wont_fix', label: 'Won\'t fix' },
  { id: 'duplicate', label: 'Duplicate' },
];
