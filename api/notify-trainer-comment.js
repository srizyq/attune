// Push notifications between a trainer and their client, in either
// direction, behind one endpoint (the project sits exactly at Vercel's
// 12-function Hobby cap, so a second endpoint isn't an option):
//
//   { clientId }                       — a trainer left their client a note
//                                        (called from useCoach.js addComment).
//   { direction: 'to-trainer',
//     trainerId }                      — a client replied to their trainer
//                                        (called from useCoach.js sendReply).
//
// Both reuse the push_subscriptions/VAPID/web-push setup that
// api/send-reminders.js already has. The caller is always authenticated and
// is checked against an *active* trainer_clients link, so neither direction
// can be used to push-spam an arbitrary user id.

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { replyPayload, withinThrottle } from './_coachPush.js';

async function sendToSubscriptions(supabase, subs, payload) {
  const body = JSON.stringify(payload);
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, body);
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
  return sent;
}

async function subscriptionsFor(supabase, userId) {
  const { data } = await supabase.from('push_subscriptions').select('id, endpoint, subscription').eq('user_id', userId);
  return data || [];
}

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
  const callerId = userData.user.id;
  const body = req.body || {};
  const toTrainer = body.direction === 'to-trainer';

  const trainerId = toTrainer ? body.trainerId : callerId;
  const clientId = toTrainer ? callerId : body.clientId;
  if (!trainerId || !clientId) {
    res.status(400).json({ error: toTrainer ? 'Missing trainerId' : 'Missing clientId' });
    return;
  }

  // Confirm this pair actually has an active relationship — without this,
  // any authenticated user could push-spam an arbitrary user id by
  // guessing/enumerating ids.
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

  webpush.setVapidDetails(vapidSubject || 'mailto:admin@example.com', vapidPublic, vapidPrivate);

  if (toTrainer) {
    // A burst of replies should buzz the coach once, not once per message.
    const { data: recent } = await supabase
      .from('trainer_comments')
      .select('created_at')
      .eq('trainer_id', trainerId)
      .eq('client_id', clientId)
      .eq('sender_role', 'client')
      .order('created_at', { ascending: false })
      .limit(2);
    if (withinThrottle((recent || []).map((r) => r.created_at))) {
      res.status(200).json({ sent: 0, reason: 'throttled' });
      return;
    }

    const { data: trainerProfile } = await supabase
      .from('profiles').select('notify_client_activity').eq('id', trainerId).maybeSingle();
    if (!trainerProfile?.notify_client_activity) {
      res.status(200).json({ sent: 0, reason: 'not opted in' });
      return;
    }
    const subs = await subscriptionsFor(supabase, trainerId);
    if (subs.length === 0) {
      res.status(200).json({ sent: 0, reason: 'no subscriptions' });
      return;
    }
    const { data: clientProfile } = await supabase.from('profiles').select('name').eq('id', clientId).maybeSingle();
    const sent = await sendToSubscriptions(supabase, subs, replyPayload(clientProfile?.name));
    res.status(200).json({ sent });
    return;
  }

  const { data: clientProfile } = await supabase
    .from('profiles').select('notify_trainer_comments').eq('id', clientId).maybeSingle();
  if (!clientProfile?.notify_trainer_comments) {
    res.status(200).json({ sent: 0, reason: 'not opted in' });
    return;
  }
  const subs = await subscriptionsFor(supabase, clientId);
  if (subs.length === 0) {
    res.status(200).json({ sent: 0, reason: 'no subscriptions' });
    return;
  }
  const { data: trainerProfile } = await supabase.from('profiles').select('name').eq('id', trainerId).maybeSingle();
  const sent = await sendToSubscriptions(supabase, subs, {
    title: 'Attune',
    body: `${trainerProfile?.name || 'Your trainer'} left you a note`,
    url: '/dashboard',
  });
  res.status(200).json({ sent });
}
