-- ════════════════════════════════════════════════════════════════════
-- Migration 018: orders 加 paid 欄位（付款狀態）
-- ════════════════════════════════════════════════════════════════════
-- 訂單表新增付款狀態欄位，預設為未付款（false）。
-- 顯示於訂單列表「印」與「狀態」之間，編輯訂單時可切換。
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT FALSE;

-- 驗證
-- SELECT id, order_date, customer_name, paid FROM orders ORDER BY order_date DESC LIMIT 10;
