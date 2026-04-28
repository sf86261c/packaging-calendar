-- ════════════════════════════════════════════════════════════════════
-- Migration 025: 帳號操作紀錄 + 30 天自動清理
-- ════════════════════════════════════════════════════════════════════
-- 設計：每次有寫入操作時 client 呼叫 log_activity RPC 寫入一筆紀錄。
-- 透過 Vercel Cron 每日呼叫 cleanup_old_activity_logs 刪除 >30 天紀錄。
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT,
  action TEXT NOT NULL,
  target TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON activity_logs(created_at DESC);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- 紀錄表開放 anon 讀取（紀錄頁顯示需要）+ INSERT（每次操作）
DROP POLICY IF EXISTS "anon_read_activity_logs" ON activity_logs;
CREATE POLICY "anon_read_activity_logs" ON activity_logs
  FOR SELECT TO anon, authenticated USING (TRUE);

DROP POLICY IF EXISTS "anon_insert_activity_logs" ON activity_logs;
CREATE POLICY "anon_insert_activity_logs" ON activity_logs
  FOR INSERT TO anon, authenticated WITH CHECK (TRUE);

-- ─── 寫入 log RPC（client 用） ───
CREATE OR REPLACE FUNCTION log_activity(
  p_username TEXT,
  p_action TEXT,
  p_target TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO activity_logs (username, action, target, metadata)
  VALUES (p_username, p_action, p_target, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_activity(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- ─── 清理過期紀錄 RPC ───
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted INT;
BEGIN
  DELETE FROM activity_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_old_activity_logs() TO anon, authenticated;
