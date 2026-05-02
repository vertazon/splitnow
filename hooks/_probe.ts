import type { Database } from '@/types/database';
import { supabase } from '@/lib/supabase';

type S = Database['public'];
type GenericSchema = {
  Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: any[] }>;
  Views: Record<string, any>;
  Functions: Record<string, any>;
};

type Test1 = S extends GenericSchema ? 'YES' : 'NO';
type Test2 = S['Tables']['groups'] extends { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown>; Relationships: any[] } ? 'YES' : 'NO';
type Test3 = S['Tables']['groups']['Insert'] extends Record<string, unknown> ? 'YES' : 'NO';

// Strict checks (no `as` cheat):
export const t1: Test1 = 'YES';
export const t2: Test2 = 'YES';
export const t3: Test3 = 'YES';

export async function _probe() {
  const r = await supabase.from('groups').insert({ name: 'x', created_by: 'abc' });
  return r;
}
