-- Migration 004: 曲奇排序、包裝款式改名、單入蛋糕 per-item 包裝
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

-- 3. order_items 新增 packaging_id 欄位（單入蛋糕 per-item 包裝）
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS packaging_id UUID REFERENCES packaging_styles(id);
