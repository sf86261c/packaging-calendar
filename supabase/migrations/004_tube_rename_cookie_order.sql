-- Migration 004: 旋轉筒改為包裝款式名稱 + 曲奇排序調整
-- 執行方式: Supabase Dashboard > SQL Editor

-- 1. 旋轉筒產品改為包裝款式名稱
UPDATE products SET name = '旋轉筒-四季童話' WHERE name = '旋轉筒-經典原味' AND category = 'tube';
UPDATE products SET name = '旋轉筒-銀河探險' WHERE name = '旋轉筒-伯爵紅茶' AND category = 'tube';
UPDATE products SET name = '旋轉筒-馬戲團' WHERE name = '旋轉筒-茉莉花茶' AND category = 'tube';

-- 2. 包裝款式「旋轉木馬」改為「馬戲團」
UPDATE packaging_styles SET name = '馬戲團' WHERE name = '旋轉木馬';

-- 3. 曲奇排序: 綜合白-綜合粉-綜合藍-原味白-可可粉-伯爵藍
UPDATE products SET sort_order = 50 WHERE name LIKE '綜合白%' AND category = 'cookie';
UPDATE products SET sort_order = 51 WHERE name LIKE '綜合粉%' AND category = 'cookie';
UPDATE products SET sort_order = 52 WHERE name LIKE '綜合藍%' AND category = 'cookie';
UPDATE products SET sort_order = 53 WHERE name LIKE '原味白%' AND category = 'cookie';
UPDATE products SET sort_order = 54 WHERE name LIKE '可可粉%' AND category = 'cookie';
UPDATE products SET sort_order = 55 WHERE name LIKE '伯爵藍%' AND category = 'cookie';
