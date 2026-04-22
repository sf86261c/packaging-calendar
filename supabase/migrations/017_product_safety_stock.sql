-- ════════════════════════════════════════════════════════════════════
-- Migration 017: products 加 safety_stock 欄位（per-product 可編輯）
-- ════════════════════════════════════════════════════════════════════
-- 原本 inventory 頁面 SAFETY_STOCK 是 client 端寫死的 category 對照表，
-- 改為 DB 內每個產品各自設定，方便團隊調整。
--
-- backfill 對應原本的 hard-coded 值：
--   cake_bar = 2000, cookie = 200, tube_pkg = 100, 其他 = 100
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS safety_stock INT NOT NULL DEFAULT 100;

-- Backfill 對齊原本的 client-side 值
UPDATE products SET safety_stock = 2000 WHERE category = 'cake_bar';
UPDATE products SET safety_stock = 200  WHERE category = 'cookie';
UPDATE products SET safety_stock = 100  WHERE category = 'tube_pkg';

-- 驗證
-- SELECT category, name, safety_stock FROM products WHERE is_active ORDER BY sort_order;
