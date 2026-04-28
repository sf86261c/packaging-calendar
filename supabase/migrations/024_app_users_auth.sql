-- ════════════════════════════════════════════════════════════════════
-- Migration 024: 簡易帳號註冊/登入系統
-- ════════════════════════════════════════════════════════════════════
-- 設計：自建 app_users 表 + bcrypt（pgcrypto）+ SECURITY DEFINER RPC
-- 不用 Supabase Auth 因為：(1) 用戶不希望 email 驗證 (2) 內部工具，僅
-- 需 client-side 識別當前操作者用於 audit log（DB 安全仍由 RLS 把關）。
--
-- 預設種子：admin / admin888（is_admin = TRUE）
-- ════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- 不開放 anon 直接 SELECT/INSERT/UPDATE/DELETE，全部走 SECURITY DEFINER RPC
DROP POLICY IF EXISTS "block_anon_app_users" ON app_users;
CREATE POLICY "block_anon_app_users" ON app_users
  FOR ALL TO anon, authenticated
  USING (FALSE) WITH CHECK (FALSE);

-- ─── 註冊 RPC ───
CREATE OR REPLACE FUNCTION sign_up(p_username TEXT, p_password TEXT)
RETURNS TABLE(id UUID, username TEXT, is_admin BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION sign_up(TEXT, TEXT) TO anon, authenticated;

-- ─── 登入 RPC ───
CREATE OR REPLACE FUNCTION sign_in(p_username TEXT, p_password TEXT)
RETURNS TABLE(id UUID, username TEXT, is_admin BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT u.id, u.username, u.is_admin
    FROM app_users u
    WHERE u.username = trim(p_username)
      AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$;

GRANT EXECUTE ON FUNCTION sign_in(TEXT, TEXT) TO anon, authenticated;

-- ─── Seed admin / admin888 ───
INSERT INTO app_users (username, password_hash, is_admin)
VALUES ('admin', crypt('admin888', gen_salt('bf')), TRUE)
ON CONFLICT (username) DO NOTHING;
