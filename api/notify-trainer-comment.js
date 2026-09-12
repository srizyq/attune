// Sends a push notification to a client when their trainer leaves a
// comment — the client-side counterpart to Settings > Notifications'
// "Trainer updates" toggle. Called from useCoach.js's addComment right
// after a trainer_comments insert succeeds, reusing the same
// push_subscriptions/VAPID/web-push setup api/send-reminders.js already
// has for reminder pushes.

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.VITE_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate) {
    res.status(500).json({ error: 'Push notifications are not fully configured' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }
  const trainerId = userData.user.id;

  const { clientId } = req.body || {};
  if (!clientId) {
    res.status(400).json({ error: 'Missing clientId' });
    return;
  }

  // Confirm this trainer actually has an active relationship with this
  // client — without this, any authenticated user could push-spam an
  // arbitrary client id by guessing/enumerating ids.
  const { data: link } = await supabase
    .from('trainer_clients')
    .select('id')
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();
  if (!link) {
    res.status(403).json({ error: 'No active client relationship' });
    return;
  }

  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('notify_trainer_comments')
    .eq('id', clientId)
    .maybeSingle();
  if (!clientProfile?.notify_trainer_comments) {
    res.status(200).json({ sent: 0, reason: 'not opted in' });
    return;
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, subscription')
    .eq('user_id', clientId);
  if (!subs || subs.length === 0) {
    res.status(200).json({ sent: 0, reason: 'no subscriptions' });
    return;
  }

  const { data: trainerProfile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', trainerId)
    .maybeSingle();

  webpush.setVapidDetails(vapidSubject || 'mailto:admin@example.com', vapidPublic, vapidPrivate);
  const payload = JSON.stringify({
    title: 'Attune',
    body: `${trainerProfile?.name || 'Your trainer'} left you a note`,
    url: '/dashboard',
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, payload);
      sent++;
    } catch (err) {
      // 404/410 means the browser revoked or expired this subscription.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      } else {
        console.error('Push send failed:', sub.endpoint, err.message);
      }
    }
  }
  res.status(200).json({ sent });
}
