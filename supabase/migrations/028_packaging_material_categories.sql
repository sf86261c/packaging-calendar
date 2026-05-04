-- ════════════════════════════════════════════════════════════════════
-- Migration 028: 包材分類
-- ════════════════════════════════════════════════════════════════════
-- 讓使用者可在 /inventory 自訂分類區塊（例如「蜂蜜蛋糕區」「曲奇餅乾區」），
-- 把包材歸類到對應區塊；未分類包材歸到「未分類」section。
--
-- 設計：
--   - packaging_material_categories：分類主檔（name 唯一、sort_order）
--   - packaging_materials.category_id：可為 NULL（未分類），刪分類時 SET NULL
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS packaging_material_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE packaging_materials
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES packaging_material_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_packaging_materials_category_id
  ON packaging_materials(category_id);

CREATE INDEX IF NOT EXISTS idx_packaging_material_categories_sort
  ON packaging_material_categories(sort_order);

-- RLS（沿用本專案開放 anon 模式）
ALTER TABLE packaging_material_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read packaging_material_categories"
  ON packaging_material_categories;
DROP POLICY IF EXISTS "Public write packaging_material_categories"
  ON packaging_material_categories;

CREATE POLICY "Public read packaging_material_categories"
  ON packaging_material_categories FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public write packaging_material_categories"
  ON packaging_material_categories FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 驗證
-- SELECT * FROM packaging_material_categories ORDER BY sort_order;
-- SELECT name, category_id FROM packaging_materials ORDER BY name;
