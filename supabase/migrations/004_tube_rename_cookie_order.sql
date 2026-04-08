-- Migration 004: 曲奇排序、包裝款式改名、旋轉筒包裝庫存、單入蛋糕 per-item 包裝
-- 執行方式: Supabase Dashboard > SQL Editor

-- 1. 包裝款式「旋轉木馬」改為「馬戲團」
UPDATE packaging_styles SET name = '馬戲團' WHERE name = '旋轉木馬';

-- 2. 曲奇排序: 綜合白-綜合粉-綜合藍-原味白-可可粉-伯爵藍
UPDATE products SET sort_order = 50 WHERE name LIKE '綜合白%' AND category = 'cookie';
UPDATE products SET sort_order = 51 WHERE name LIKE '綜合粉%' AND category = 'cookie';
UPDATE products SET sort_order = 52 WHERE name LIKE '綜合藍%' AND category = 'cookie';
UPDATE products SET sort_order = 53 WHERE name LIKE '原味白%' AND category = 'cookie';
UPDATE products SET sort_order = 54 WHERE name LIKE '可可粉%' AND category = 'cookie';
UPDATE products SET sort_order = 55 WHERE name LIKE '伯爵藍%' AND category = 'cookie';

-- 3. 旋轉筒包裝庫存追蹤（新增 tube_pkg 類別產品）
-- 訂單介面的旋轉筒保持口味名稱，庫存追蹤改為包裝款式
INSERT INTO products (category, name, sort_order, is_active) VALUES
  ('tube_pkg', '四季童話', 40, true),
  ('tube_pkg', '銀河探險', 41, true),
  ('tube_pkg', '馬戲團', 42, true);

-- 4. order_items 新增 packaging_id 欄位（單入蛋糕 per-item 包裝）
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS packaging_id UUID REFERENCES packaging_styles(id);

-- 5. 旋轉筒名稱恢復口味（若已被之前的 migration 改為包裝款式）
UPDATE products SET name = '旋轉筒-經典原味' WHERE name = '旋轉筒-四季童話' AND category = 'tube';
UPDATE products SET name = '旋轉筒-伯爵紅茶' WHERE name = '旋轉筒-銀河探險' AND category = 'tube';
UPDATE products SET name = '旋轉筒-茉莉花茶' WHERE name = '旋轉筒-馬戲團' AND category = 'tube';

-- 6. product_material_usage 新增 packaging_style_id 欄位（用量對照含包裝款式維度）
ALTER TABLE product_material_usage ADD COLUMN IF NOT EXISTS packaging_style_id UUID REFERENCES packaging_styles(id);
