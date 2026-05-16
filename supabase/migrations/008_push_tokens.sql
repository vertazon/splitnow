-- Migration 008: Push tokens table for expo-notifications

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token      text        NOT NULL,
  platform   text        CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own tokens
CREATE POLICY "push_tokens_select" ON public.push_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "push_tokens_insert" ON public.push_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_tokens_delete" ON public.push_tokens
  FOR DELETE USING (user_id = auth.uid());
