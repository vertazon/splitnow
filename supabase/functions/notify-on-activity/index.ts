// Supabase Edge Function: notify-on-activity
// Triggered by a DB webhook on activity INSERT.
// Fetches the recipient's push token and sends via Expo Push API.
//
// Webhook setup (Supabase dashboard → Database → Webhooks):
//   Table: activity  |  Event: INSERT
//   POST → https://<project-ref>.supabase.co/functions/v1/notify-on-activity
//   Headers: Authorization: Bearer <service_role_key>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ActivityRecord {
  id:         string;
  user_id:    string;
  actor_id:   string;
  type:       string;
  ref_id:     string | null;
  ref_type:   string | null;
  group_id:   string | null;
  meta:       Record<string, unknown> | null;
  read:       boolean;
  created_at: string;
}

function buildPayload(record: ActivityRecord): { title: string; body: string } {
  const meta = record.meta ?? {};
  const actorName = (meta.actor_name as string) ?? 'Someone';

  switch (record.type) {
    case 'expense_added':
      return {
        title: `${actorName} added an expense`,
        body:  `${meta.title ?? 'New expense'} · ₹${meta.amount ?? ''}`,
      };
    case 'expense_edited':
      return {
        title: `${actorName} updated an expense`,
        body:  meta.old_amount && meta.amount
          ? `₹${meta.old_amount} → ₹${meta.amount}`
          : `${meta.title ?? 'An expense'} was updated`,
      };
    case 'expense_deleted':
      return {
        title: `${actorName} deleted an expense`,
        body:  String(meta.title ?? 'An expense was deleted'),
      };
    case 'settlement_received':
      return {
        title: `${actorName} settled up`,
        body:  `₹${meta.amount ?? ''} received`,
      };
    case 'comment_added':
      return {
        title: `${actorName} commented on ${meta.expense_title ?? 'an expense'}`,
        body:  String(meta.comment_text ?? ''),
      };
    default:
      return { title: 'SplitNow', body: 'You have a new notification' }; // APP_NAME — update when name is finalised
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const record: ActivityRecord = body.record ?? body;

    // Skip self-actions — actor shouldn't get push for their own events
    if (record.actor_id === record.user_id) {
      return new Response('ok', { status: 200 });
    }

    // Check recipient's notification preferences
    const { data: userRow } = await supabase
      .from('users')
      .select('notification_prefs')
      .eq('id', record.user_id)
      .maybeSingle();

    const prefs = (userRow?.notification_prefs ?? {}) as Record<string, boolean>;
    // If the preference key exists and is explicitly false, skip
    if (record.type in prefs && prefs[record.type] === false) {
      return new Response('muted', { status: 200 });
    }

    // Fetch push token for the recipient
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', record.user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenErr || !tokenRow?.token) {
      return new Response('no token', { status: 200 });
    }

    const { title, body: msgBody } = buildPayload(record);

    const pushRes = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        to:    tokenRow.token,
        title,
        body:  msgBody,
        sound: 'default',
        data: {
          ref_type: record.ref_type,
          ref_id:   record.ref_id,
          type:     record.type,
        },
      }),
    });

    if (!pushRes.ok) {
      const text = await pushRes.text();
      console.error('[push] Expo API error:', text);
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('[push] handler error:', err);
    return new Response('error', { status: 500 });
  }
});
