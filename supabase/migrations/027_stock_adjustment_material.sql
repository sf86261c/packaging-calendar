-- === Migration 027: stock_adjustment_items 支援 material_id ===
--
-- 目的：「耗損」類型的原料下拉允許選包材（小/中/大紙箱），
--       選擇後扣減 packaging_material_inventory 而非 inventory。
--
-- 設計：stock_adjustment_items 新增 material_id 欄位，
--       與 product_id 互斥（擇一非 null）。
--       既有資料 product_id 全為非 null，不需回填。

ALTER TABLE stock_adjustment_items
  ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES packaging_materials(id) ON DELETE RESTRICT;

ALTER TABLE stock_adjustment_items
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE stock_adjustment_items
  DROP CONSTRAINT IF EXISTS stock_adjustment_items_product_or_material;

ALTER TABLE stock_adjustment_items
  ADD CONSTRAINT stock_adjustment_items_product_or_material
  CHECK (
    (product_id IS NOT NULL AND material_id IS NULL)
    OR (product_id IS NULL AND material_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_material
  ON stock_adjustment_items(material_id)
  WHERE material_id IS NOT NULL;
