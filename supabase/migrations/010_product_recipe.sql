-- === Migration 010: product_recipe (原料配方) ===

CREATE TABLE product_recipe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_per_unit NUMERIC NOT NULL CHECK (quantity_per_unit > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, ingredient_id)
);
CREATE INDEX idx_product_recipe_product ON product_recipe(product_id);

ALTER TABLE product_recipe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select product_recipe"
  ON product_recipe FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert product_recipe"
  ON product_recipe FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update product_recipe"
  ON product_recipe FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete product_recipe"
  ON product_recipe FOR DELETE TO authenticated USING (true);

-- Seed cake (6 產品)
-- 組合盒「A+B」→ A × 1 + B × 1
-- 單口味盒「A」→ A × 2
-- 注意：cake_bar 產品名稱含「（條）」後綴（如「經典原味（條）」），比對時需剝除
INSERT INTO product_recipe (product_id, ingredient_id, quantity_per_unit)
SELECT c.id, cb.id, CASE
  WHEN c.name = REPLACE(cb.name, '（條）', '') THEN 2
  WHEN c.name LIKE REPLACE(cb.name, '（條）', '') || '+%' THEN 1
  WHEN c.name LIKE '%+' || REPLACE(cb.name, '（條）', '') THEN 1
END
FROM products c
JOIN products cb ON cb.category = 'cake_bar' AND cb.is_active = true
WHERE c.category = 'cake' AND c.is_active = true
  AND (c.name = REPLACE(cb.name, '（條）', '')
       OR c.name LIKE REPLACE(cb.name, '（條）', '') || '+%'
       OR c.name LIKE '%+' || REPLACE(cb.name, '（條）', ''))
ON CONFLICT (product_id, ingredient_id) DO NOTHING;

-- Seed tube (3 產品)
INSERT INTO product_recipe (product_id, ingredient_id, quantity_per_unit)
SELECT t.id, cb.id, 1
FROM products t
JOIN products cb ON cb.category = 'cake_bar' AND cb.is_active = true
WHERE t.category = 'tube' AND t.is_active = true
  AND REPLACE(t.name, '旋轉筒-', '') = REPLACE(cb.name, '（條）', '')
ON CONFLICT (product_id, ingredient_id) DO NOTHING;

-- Seed single_cake (3 產品)
INSERT INTO product_recipe (product_id, ingredient_id, quantity_per_unit)
SELECT s.id, cb.id, 0.25
FROM products s
JOIN products cb ON cb.category = 'cake_bar' AND cb.is_active = true
WHERE s.category = 'single_cake' AND s.is_active = true
  AND REPLACE(s.name, '單入-', '') = REPLACE(cb.name, '（條）', '')
ON CONFLICT (product_id, ingredient_id) DO NOTHING;
