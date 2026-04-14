-- Migration 005: 包裝款式/烙印款式加入適用類別欄位
-- 讓設定頁面可選擇關聯性，取代前端硬編碼的 PACKAGING_CATEGORIES

-- 1. packaging_styles 加 category 欄位
ALTER TABLE packaging_styles ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. branding_styles 加 category 欄位
ALTER TABLE branding_styles ADD COLUMN IF NOT EXISTS category TEXT;

-- 3. Seed 現有包裝款式的類別
UPDATE packaging_styles SET category = 'cake' WHERE name IN ('祝福緞帶(米)', '森林旋律(粉)', '歡樂派對(藍)');
UPDATE packaging_styles SET category = 'tube' WHERE name IN ('四季童話', '銀河探險', '馬戲團');
UPDATE packaging_styles SET category = 'single_cake' WHERE name IN ('愛心', '花園', '小熊');

-- 4. Seed 現有烙印款式的類別（目前全部屬於蜂蜜蛋糕）
UPDATE branding_styles SET category = 'cake' WHERE category IS NULL;
