-- ════════════════════════════════════════════════════════════════════
-- Migration 022: products 加 is_common + 補入 6 個曲奇特殊組合
-- ════════════════════════════════════════════════════════════════════
-- 目的：曲奇有 6 個不常被訂購的特殊組合（原味粉/原味藍/伯爵白/伯爵粉/
--       可可白/可可藍），不希望每次都顯示在訂單下拉選單中。
--       新增 is_common BOOLEAN，預設 TRUE。曲奇特殊組合設為 FALSE，
--       訂單 dialog 預設只列 is_common = TRUE 的品項，提供「顯示其他
--       組合」按鈕展開。
--
-- 此 migration 為加欄位 + 補資料 + UPDATE，IF NOT EXISTS / WHERE 篩選
-- 確保可重複執行，不破壞既有資料。
-- ════════════════════════════════════════════════════════════════════

-- 1. 加 is_common 欄位（預設 TRUE — 既有資料全部視為常用）
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_common BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. 補入 6 個曲奇特殊組合（不存在時才 INSERT，避免重複執行報錯）
INSERT INTO products (category, name, sort_order, is_active, is_common)
SELECT 'cookie', name, sort_order, TRUE, FALSE
FROM (VALUES
  ('原味粉', 60),
  ('原味藍', 61),
  ('伯爵白', 62),
  ('伯爵粉', 63),
  ('可可白', 64),
  ('可可藍', 65)
) AS new_cookies(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM products p
  WHERE p.category = 'cookie' AND p.name = new_cookies.name
);

-- 3. 確保這 6 個（不論先前是否已存在）標記為非常用
UPDATE products
SET is_common = FALSE
WHERE category = 'cookie'
  AND name IN ('原味粉', '原味藍', '伯爵白', '伯爵粉', '可可白', '可可藍');

-- 驗證
-- SELECT category, name, sort_order, is_common, is_active FROM products
-- WHERE category = 'cookie' ORDER BY sort_order;
