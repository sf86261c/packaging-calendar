-- ════════════════════════════════════════════════════════════════════
-- Migration 031: app_users 加 permissions + is_active + 管理 RPC
-- ════════════════════════════════════════════════════════════════════
-- 設計：
--   - permissions JSONB：頁面 → 模式對應，例如：
--       {"calendar":"edit","dashboard":"view","inventory":"view","activity":"view","settings":"none"}
--     模式：none(看不到+擋 URL) / view(可看不可改) / edit(完整)
--   - is_admin = TRUE 時 permissions 被忽略（永遠全頁面 edit）
--   - is_active：停用後無法登入
-- 管理 RPC：admin_list_users / admin_create_user / admin_update_user
--          / admin_reset_password / admin_delete_user
-- 共同 guard：caller 必須 is_admin AND is_active
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── 更新 sign_in：加 is_active 檢查 + 回傳 permissions ───
DROP FUNCTION IF EXISTS sign_in(TEXT, TEXT);
CREATE FUNCTION sign_in(p_username TEXT, p_password TEXT)
RETURNS TABLE(id UUID, username TEXT, is_admin BOOLEAN, permissions JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
    SELECT u.id, u.username, u.is_admin, u.permissions
    FROM app_users u
    WHERE u.username = trim(p_username)
      AND u.is_active = TRUE
      AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$;
GRANT EXECUTE ON FUNCTION sign_in(TEXT, TEXT) TO anon, authenticated;

-- ─── 更新 sign_up 也回傳 permissions ───
DROP FUNCTION IF EXISTS sign_up(TEXT, TEXT);
CREATE FUNCTION sign_up(p_username TEXT, p_password TEXT)
RETURNS TABLE(id UUID, username TEXT, is_admin BOOLEAN, permissions JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_username TEXT;
  v_id UUID;
BEGIN
  v_username := trim(p_username);
  IF v_username IS NULL OR v_username = '' THEN
    RAISE EXCEPTION '帳號不可為空' USING ERRCODE = '22023';
  END IF;
  IF p_password IS NULL OR length(p_password) < 4 THEN
    RAISE EXCEPTION '密碼至少 4 個字元' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM app_users u WHERE u.username = v_username) THEN
    RAISE EXCEPTION '帳號 % 已被使用', v_username USING ERRCODE = '23505';
  END IF;

  INSERT INTO app_users (username, password_hash, is_admin)
  VALUES (v_username, crypt(p_password, gen_salt('bf')), FALSE)
  RETURNING app_users.id INTO v_id;

  RETURN QUERY
    SELECT u.id, u.username, u.is_admin, u.permissions
    FROM app_users u
    WHERE u.id = v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION sign_up(TEXT, TEXT) TO anon, authenticated;

-- ─── 內部 helper：驗證 caller 是 active admin ───
CREATE OR REPLACE FUNCTION _assert_caller_admin(p_caller_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM app_users u
    WHERE u.id = p_caller_id AND u.is_admin AND u.is_active
  ) THEN
    RAISE EXCEPTION '無權限：僅管理員可執行' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- ─── admin_list_users ───
CREATE OR REPLACE FUNCTION admin_list_users(p_caller_id UUID)
RETURNS TABLE(
  id UUID,
  username TEXT,
  is_admin BOOLEAN,
  permissions JSONB,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _assert_caller_admin(p_caller_id);
  RETURN QUERY
    SELECT u.id, u.username, u.is_admin, u.permissions, u.is_active, u.created_at
    FROM app_users u
    ORDER BY u.created_at;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_list_users(UUID) TO anon, authenticated;

-- ─── admin_create_user ───
CREATE OR REPLACE FUNCTION admin_create_user(
  p_caller_id UUID,
  p_username TEXT,
  p_password TEXT,
  p_is_admin BOOLEAN,
  p_permissions JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_username TEXT;
  v_id UUID;
BEGIN
  PERFORM _assert_caller_admin(p_caller_id);
  v_username := trim(p_username);
  IF v_username IS NULL OR v_username = '' THEN
    RAISE EXCEPTION '帳號不可為空' USING ERRCODE = '22023';
  END IF;
  IF p_password IS NULL OR length(p_password) < 4 THEN
    RAISE EXCEPTION '密碼至少 4 個字元' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM app_users u WHERE u.username = v_username) THEN
    RAISE EXCEPTION '帳號 % 已被使用', v_username USING ERRCODE = '23505';
  END IF;
  INSERT INTO app_users (username, password_hash, is_admin, permissions)
  VALUES (
    v_username,
    crypt(p_password, gen_salt('bf')),
    COALESCE(p_is_admin, FALSE),
    COALESCE(p_permissions, '{}'::jsonb)
  )
  RETURNING app_users.id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_create_user(UUID, TEXT, TEXT, BOOLEAN, JSONB) TO anon, authenticated;

-- ─── admin_update_user ───
CREATE OR REPLACE FUNCTION admin_update_user(
  p_caller_id UUID,
  p_target_id UUID,
  p_is_admin BOOLEAN,
  p_permissions JSONB,
  p_is_active BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _assert_caller_admin(p_caller_id);
  -- 防止把自己降級 / 停用，否則會自鎖
  IF p_caller_id = p_target_id THEN
    IF p_is_admin = FALSE THEN
      RAISE EXCEPTION '不能取消自己的管理員權限' USING ERRCODE = '42501';
    END IF;
    IF p_is_active = FALSE THEN
      RAISE EXCEPTION '不能停用自己的帳號' USING ERRCODE = '42501';
    END IF;
  END IF;
  UPDATE app_users SET
    is_admin = COALESCE(p_is_admin, is_admin),
    permissions = COALESCE(p_permissions, permissions),
    is_active = COALESCE(p_is_active, is_active)
  WHERE id = p_target_id;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_update_user(UUID, UUID, BOOLEAN, JSONB, BOOLEAN) TO anon, authenticated;

-- ─── admin_reset_password ───
CREATE OR REPLACE FUNCTION admin_reset_password(
  p_caller_id UUID,
  p_target_id UUID,
  p_new_password TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM _assert_caller_admin(p_caller_id);
  IF p_new_password IS NULL OR length(p_new_password) < 4 THEN
    RAISE EXCEPTION '密碼至少 4 個字元' USING ERRCODE = '22023';
  END IF;
  UPDATE app_users SET
    password_hash = crypt(p_new_password, gen_salt('bf'))
  WHERE id = p_target_id;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_reset_password(UUID, UUID, TEXT) TO anon, authenticated;

-- ─── admin_delete_user ───
CREATE OR REPLACE FUNCTION admin_delete_user(p_caller_id UUID, p_target_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _assert_caller_admin(p_caller_id);
  IF p_caller_id = p_target_id THEN
    RAISE EXCEPTION '不能刪除自己' USING ERRCODE = '42501';
  END IF;
  DELETE FROM app_users WHERE id = p_target_id;
END;
$$;
GRANT EXECUTE ON FUNCTION admin_delete_user(UUID, UUID) TO anon, authenticated;
