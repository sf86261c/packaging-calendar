-- ════════════════════════════════════════════════════════════════════
-- Migration 026: 修正 sign_up / sign_in 的 search_path
-- ════════════════════════════════════════════════════════════════════
-- 問題：Supabase 把 pgcrypto 安裝在 `extensions` schema。Migration 024
-- 的 RPC 用 `SET search_path = public`，蓋掉預設的 `extensions`，
-- 導致呼叫 gen_salt() / crypt() 報錯：
--   function gen_salt(unknown) does not exist
--
-- 修法：改 search_path 為 `public, extensions`，讓 RPC 內可解析 pgcrypto
-- 提供的函式。CREATE OR REPLACE 不破壞既有授權。
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sign_up(p_username TEXT, p_password TEXT)
RETURNS TABLE(id UUID, username TEXT, is_admin BOOLEAN)
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
    SELECT u.id, u.username, u.is_admin
    FROM app_users u
    WHERE u.id = v_id;
END;
$$;

CREATE OR REPLACE FUNCTION sign_in(p_username TEXT, p_password TEXT)
RETURNS TABLE(id UUID, username TEXT, is_admin BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
    SELECT u.id, u.username, u.is_admin
    FROM app_users u
    WHERE u.username = trim(p_username)
      AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$;
