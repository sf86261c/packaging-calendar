-- ════════════════════════════════════════════════════════════════════
-- Migration 019: products 加 lead_time_days + show_in_inventory
-- ════════════════════════════════════════════════════════════════════
-- 1. lead_time_days：每個產品的到貨時間（天），用於庫存頁面顯示「D+N
--    預計庫存」與叫貨通知判斷未來 N 天後是否低於安全庫存。
--    預設 15（對齊原本蛋糕的硬編碼 D+15）。
-- 2. show_in_inventory：是否在庫存頁顯示與納入叫貨通知。預設 true。
--    曲奇透過此旗標可整批隱藏（UI 提供切換按鈕）。
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS lead_time_days INT NOT NULL DEFAULT 15;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS show_in_inventory BOOLEAN NOT NULL DEFAULT TRUE;

-- 驗證
-- SELECT category, name, lead_time_days, show_in_inventory FROM products WHERE is_active ORDER BY sort_order;
