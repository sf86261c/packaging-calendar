-- ════════════════════════════════════════════════════════════════════
-- Migration 029: 停用 tube_pkg 三筆產品
-- ════════════════════════════════════════════════════════════════════
-- 旋轉筒包裝（tube_pkg）的扣減已改為走 product_material_usage（包材機制），
-- 同名 tube_pkg 產品（四季童話 / 銀河探險 / 樂園馬戲）不再需要。
--
-- 先前邏輯：訂單下旋轉筒口味 + 選包裝 → name-match 找同名 tube_pkg 產品扣減
-- 現在：訂單同樣動作 → 透過 product_material_usage 扣對應 packaging_material
--
-- 此 migration 把三筆 tube_pkg product 設 is_active = false，
-- 既有 inventory 紀錄保留以便回溯，但不再會被新訂單寫入或顯示。
-- ════════════════════════════════════════════════════════════════════

UPDATE products
SET is_active = false
WHERE category = 'tube_pkg'
  AND name IN ('四季童話', '銀河探險', '樂園馬戲');

-- 驗證
-- SELECT name, is_active FROM products WHERE category = 'tube_pkg';
