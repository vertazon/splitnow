-- Migration 006: Activity feed table + RLS

CREATE TABLE IF NOT EXISTS public.activity (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES public.users(id) ON DELETE CASCADE,  -- recipient
  actor_id   uuid        REFERENCES public.users(id),                    -- who did it
  type       text        NOT NULL,
  ref_id     uuid,       -- expense_id / settlement_id / comment_id
  ref_type   text,       -- 'expense' | 'settlement' | 'comment'
  group_id   uuid        REFERENCES public.groups(id) ON DELETE CASCADE,
  meta       jsonb,
  read       boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_user_created_idx ON public.activity (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_unread_idx       ON public.activity (user_id, read) WHERE read = false;

ALTER TABLE public.activity ENABLE ROW LEVEL SECURITY;

-- Users can only see their own activity rows
CREATE POLICY "activity_select" ON public.activity
  FOR SELECT USING (user_id = auth.uid());

-- Anyone who is a group member can insert activity rows for others in that group
CREATE POLICY "activity_insert" ON public.activity
  FOR INSERT WITH CHECK (
    actor_id = auth.uid()
    AND (
      group_id IS NULL
      OR is_group_member(group_id)
    )
  );

-- Users can mark their own activity as read
CREATE POLICY "activity_update" ON public.activity
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
