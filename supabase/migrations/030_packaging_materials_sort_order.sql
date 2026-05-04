-- ════════════════════════════════════════════════════════════════════
-- Migration 030: packaging_materials 加 sort_order 支援拖拉排序
-- ════════════════════════════════════════════════════════════════════
-- 庫存頁面每張包材卡可拖動排序，存於 packaging_materials.sort_order。
-- 預設值 0；首次部署後 backfill 為按 name 字母序的 10/20/30/...
-- (留間隔方便後續單獨插入新 row 不需 reorder 全部)
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE packaging_materials
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_packaging_materials_sort
  ON packaging_materials(sort_order);

-- Backfill: 按 name 排序給每筆 10/20/30/... 的初始 sort_order
WITH numbered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY name) * 10)::INT AS rn
  FROM packaging_materials
)
UPDATE packaging_materials pm
SET sort_order = numbered.rn
FROM numbered
WHERE pm.id = numbered.id
  AND pm.sort_order = 0;

-- 驗證
-- SELECT name, sort_order FROM packaging_materials ORDER BY sort_order;
