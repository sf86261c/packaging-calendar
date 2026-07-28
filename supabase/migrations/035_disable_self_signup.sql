-- ════════════════════════════════════════════════════════════════════
-- Migration 035: 關閉自助註冊（帳號一律由管理員在 /settings 建立）
-- ════════════════════════════════════════════════════════════════════
-- 業主 2026-07-28 裁決。
--
-- 為什麼只改前端不夠：
--   024/031 對 sign_up 下了 `GRANT EXECUTE ... TO anon, authenticated`，
--   任何人拿 client bundle 裡的 anon key 直接 POST /rest/v1/rpc/sign_up
--   就能造出帳號，完全不經過登入頁。實測（2026-07-28）以 anon key 呼叫
--   sign_up 回 HTTP 409「帳號 admin 已被使用」——是業務錯誤而非權限錯誤，
--   證明權限確實敞開著。
--
-- 本檔只撤權、不刪函式：
--   保留函式本體，未來若要恢復自助註冊只需重新 GRANT；
--   且 admin_create_user 走的是另一條路徑（SECURITY DEFINER + caller 檢查），
--   不受本次撤權影響，管理員新增帳號的功能照常運作。
--
-- ⚠ 執行方式：整檔貼入 Supabase Dashboard > SQL Editor 執行。
-- ⚠ 執行後請跑 `node scripts/verify-no-self-signup.mjs` 確認全綠。
--
-- ⚠⚠ 持久性風險（2026-07-28 驗收指出）：
--   031_app_users_permissions.sql:71 那行
--     GRANT EXECUTE ON FUNCTION sign_up(TEXT, TEXT) TO anon, authenticated;
--   仍留在檔案史裡。**若日後重跑 031、或以 CREATE OR REPLACE 重建 sign_up，
--   本檔的撤權會被無聲抵銷**，自助註冊的洞就重新打開而沒有任何警訊。
--   → 任何動到 sign_up 或重跑 031 的操作之後，都必須重跑
--     `node scripts/verify-no-self-signup.mjs` 確認仍是紅→綠的綠。
--   （未證實：Supabase 專案若設有 ALTER DEFAULT PRIVILEGES ... GRANT ALL
--     ON FUNCTIONS TO anon，則連裸 CREATE 都會自動再授權。無法從 REST 端
--     驗證，需在 Dashboard SQL Editor 查 pg_default_acl 才能確認。）
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 撤銷 anon / authenticated 對 sign_up 的執行權 ───────────────────
REVOKE EXECUTE ON FUNCTION sign_up(TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION sign_up(TEXT, TEXT) FROM authenticated;

-- PUBLIC 也一併撤掉：PostgreSQL 對函式預設 GRANT EXECUTE TO PUBLIC，
-- 只撤 anon/authenticated 的話會透過 PUBLIC 繼承回來，等於沒撤。
REVOKE EXECUTE ON FUNCTION sign_up(TEXT, TEXT) FROM PUBLIC;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 驗證（執行後跑，應回傳 0 列；若有列出 anon/authenticated/PUBLIC 代表沒撤乾淨）
-- ════════════════════════════════════════════════════════════════════
-- SELECT grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_name = 'sign_up'
--   AND grantee IN ('anon', 'authenticated', 'PUBLIC');

-- ════════════════════════════════════════════════════════════════════
-- 回滾（若要恢復自助註冊）
-- ════════════════════════════════════════════════════════════════════
-- GRANT EXECUTE ON FUNCTION sign_up(TEXT, TEXT) TO anon, authenticated;
-- 另需還原 src/app/login/page.tsx 的註冊 UI（見本次 commit）。
