-- Migration 007: Enable realtime for activity table
-- Without this the postgres_changes subscription fires no events.
-- REPLICA IDENTITY FULL is required for filtered subscriptions on non-PK columns.

ALTER TABLE public.activity REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.activity;
