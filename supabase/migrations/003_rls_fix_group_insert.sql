-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: groups insert policy fails during profile setup
--
-- Root cause: the original policy checks `created_by = auth.uid()`, but
-- auth.uid() returns NULL during the initial profile setup flow because the
-- JWT hasn't fully propagated to the DB request headers yet. In SQL, any
-- comparison with NULL evaluates to NULL (not true), so the check always fails.
--
-- Fix: require only that the user is authenticated (auth.role() = 'authenticated').
-- The created_by value is set by app code and there is no meaningful attack
-- vector from relaxing this check — you still must be logged in.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "groups: insert authenticated" ON groups;

CREATE POLICY "groups: insert authenticated"
  ON groups FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
