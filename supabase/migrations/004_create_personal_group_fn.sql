-- ─────────────────────────────────────────────────────────────────────────────
-- create_personal_group(p_user_id uuid) → uuid
--
-- SECURITY DEFINER: runs as the function owner (postgres), bypassing RLS.
-- Used by the app on first sign-in to bootstrap the user's personal group
-- without relying on the JWT being attached correctly to direct inserts.
--
-- Idempotent: if the user already has a personal group, returns its id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_personal_group(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
BEGIN
  -- Return existing personal group if one already exists
  SELECT gm.group_id INTO v_group_id
  FROM group_members gm
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.user_id  = p_user_id
    AND g.group_type = 'personal'
    AND gm.left_at  IS NULL
  LIMIT 1;

  IF v_group_id IS NOT NULL THEN
    RETURN v_group_id;
  END IF;

  -- Create personal group
  INSERT INTO groups (name, group_type, created_by)
  VALUES ('Personal', 'personal', p_user_id)
  RETURNING id INTO v_group_id;

  -- Add user as admin member
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_group_id, p_user_id, 'admin');

  RETURN v_group_id;
END;
$$;
