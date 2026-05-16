import { supabase } from '@/lib/supabase';
import type { ActivityInsert } from '@/types/database';

/**
 * Writes one activity row per recipient.
 * Non-fatal: a fan-out failure must never roll back the parent mutation.
 * Callers should fire this in onSuccess and ignore errors from here.
 */
export async function fanOutActivity(rows: ActivityInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('activity').insert(rows as any);
  if (error) console.warn('[activity] fan-out failed:', error.message);
}
