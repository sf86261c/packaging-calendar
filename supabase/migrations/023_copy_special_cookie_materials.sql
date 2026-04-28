-- ════════════════════════════════════════════════════════════════════
-- Migration 023: 複製曲奇特殊組合的包材配方
-- ════════════════════════════════════════════════════════════════════
-- 依賴：022_product_is_common.sql 必須先執行（6 個特殊組合產品才存在）
--
-- 對應規則（同口味共用配方）：
--   原味白 → 原味粉、原味藍
--   伯爵藍 → 伯爵白、伯爵粉
--   可可粉 → 可可白、可可藍
--
-- 從來源產品的 product_material_usage 動態抓取所有 (material_id,
-- packaging_style_id, quantity_per_unit) 紀錄，複製到對應的新產品。
-- 用 NOT EXISTS 確保可重複執行：若新產品已有任何配方則整批跳過，避免
-- 把使用者手動改過的配方覆蓋掉。
-- ════════════════════════════════════════════════════════════════════

INSERT INTO product_material_usage (product_id, material_id, packaging_style_id, quantity_per_unit)
SELECT
  new_p.id AS product_id,
  pmu.material_id,
  pmu.packaging_style_id,
  pmu.quantity_per_unit
FROM product_material_usage pmu
JOIN products old_p ON old_p.id = pmu.product_id
JOIN (VALUES
  ('原味白', '原味粉'),
  ('原味白', '原味藍'),
  ('伯爵藍', '伯爵白'),
  ('伯爵藍', '伯爵粉'),
  ('可可粉', '可可白'),
  ('可可粉', '可可藍')
) AS mapping(source_name, target_name)
  ON old_p.name = mapping.source_name AND old_p.category = 'cookie'
JOIN products new_p
  ON new_p.name = mapping.target_name AND new_p.category = 'cookie'
WHERE NOT EXISTS (
  SELECT 1 FROM product_material_usage existing
  WHERE existing.product_id = new_p.id
);

-- 驗證
-- SELECT p.name, pmu.material_id, pmu.packaging_style_id, pmu.quantity_per_unit
-- FROM product_material_usage pmu
-- JOIN products p ON p.id = pmu.product_id
-- WHERE p.category = 'cookie'
-- ORDER BY p.sort_order;
