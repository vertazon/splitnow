/**
 * cleanup-deleted-users — Edge Function
 *
 * Anonymizes user rows where:
 *   - deleted_at is set (soft-deleted)
 *   - deleted_at is older than 30 days
 *   - anonymized_at is null (not yet cleaned up)
 *
 * Overwrites PII fields: name → "Deleted User", phone/upi_id/invite_code → null.
 * Hard-deleting the row is intentionally avoided to preserve referential
 * integrity with expenses, splits, comments, settlements, and activity records.
 *
 * Schedule: run daily at 02:00 UTC via Supabase Dashboard
 *   Edge Functions → cleanup-deleted-users → Schedule → "0 2 * * *"
 *
 * Auth: caller must pass the service role key as a Bearer token.
 * The function itself runs with the service role (bypasses RLS).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) {
    return json({ error: 'Service role key not configured' }, 500);
  }

  // Verify the caller passes the service role key as Bearer token.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ') || !authHeader.includes(serviceRoleKey)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
    { auth: { persistSession: false } },
  );

  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const { data: users, error: fetchErr } = await supabase
    .from('users')
    .select('id')
    .not('deleted_at', 'is', null)
    .lte('deleted_at', cutoff)
    .is('anonymized_at', null);

  if (fetchErr) {
    console.error('[cleanup] fetch failed:', fetchErr.message);
    return json({ error: fetchErr.message }, 500);
  }

  if (!users || users.length === 0) {
    return json({ anonymized: 0, message: 'No accounts pending cleanup' });
  }

  const results = await Promise.all(
    users.map(async ({ id }) => {
      const { error } = await supabase
        .from('users')
        .update({
          name:          'Deleted User',
          phone:         null,
          upi_id:        null,
          invite_code:   null,
          anonymized_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) console.error(`[cleanup] failed for user ${id}:`, error.message);
      return { id, ok: !error };
    }),
  );

  const anonymized = results.filter(r => r.ok).length;
  const failed     = results.filter(r => !r.ok).length;

  console.log(`[cleanup] done — anonymized: ${anonymized}, failed: ${failed}`);
  return json({ anonymized, failed });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
