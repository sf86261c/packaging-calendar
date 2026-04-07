-- ============================================
-- Migration 002: Update products, branding, packaging
-- ============================================

-- 1. Delete old products (cascade will clean order_items)
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM inventory;
DELETE FROM products;

-- 2. Insert new products
-- Raw cake bars (for inventory tracking, category = 'cake_bar')
INSERT INTO products (category, name, sort_order) VALUES
  ('cake_bar', '經典原味（條）', 1),
  ('cake_bar', '伯爵紅茶（條）', 2),
  ('cake_bar', '茉莉花茶（條）', 3);

-- Cake combo boxes (for ordering, category = 'cake')
INSERT INTO products (category, name, sort_order) VALUES
  ('cake', '經典原味+伯爵紅茶', 10),
  ('cake', '經典原味+茉莉花茶', 11),
  ('cake', '伯爵紅茶+茉莉花茶', 12);

-- Tube products (category = 'tube')
INSERT INTO products (category, name, sort_order) VALUES
  ('tube', '旋轉筒-經典原味', 20),
  ('tube', '旋轉筒-伯爵紅茶', 21),
  ('tube', '旋轉筒-茉莉花茶', 22);

-- Single cake (category = 'single_cake')
INSERT INTO products (category, name, sort_order) VALUES
  ('single_cake', '單入-經典原味', 30),
  ('single_cake', '單入-伯爵紅茶', 31),
  ('single_cake', '單入-茉莉花茶', 32);

-- Cookie products (unchanged, category = 'cookie')
INSERT INTO products (category, name, sort_order) VALUES
  ('cookie', '原味白🍪', 40),
  ('cookie', '可可粉🍪', 41),
  ('cookie', '伯爵藍🍪', 42),
  ('cookie', '綜合白🍪', 43),
  ('cookie', '綜合粉🍪', 44),
  ('cookie', '綜合藍🍪', 45);

-- 3. Update category check constraint
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_check;
ALTER TABLE products ADD CONSTRAINT products_category_check
  CHECK (category IN ('cake', 'cake_bar', 'cookie', 'tube', 'single_cake', 'pineapple'));

-- 4. Update branding styles
DELETE FROM branding_styles;
INSERT INTO branding_styles (name) VALUES
  ('甜蜜樂章'), ('慶祝派對'), ('馬年限定');

-- 5. Update packaging styles - add tube and single cake packaging
DELETE FROM packaging_styles;
INSERT INTO packaging_styles (name, color_code) VALUES
  -- Cake packaging (existing, renamed)
  ('祝福緞帶(米)', '#F5F0E6'),
  ('森林旋律(粉)', '#FFE4E8'),
  ('歡樂派對(藍)', '#DBEAFE'),
  -- Tube packaging
  ('四季童話', '#E8F5E9'),
  ('銀河探險', '#E3F2FD'),
  ('旋轉木馬', '#FFF3E0'),
  -- Single cake packaging
  ('愛心', '#FCE4EC'),
  ('花園', '#E8F5E9'),
  ('小熊', '#FFF8E1');

-- 6. Add printed column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS printed BOOLEAN NOT NULL DEFAULT false;

-- 7. Remove payment_status constraint (no longer needed, replaced by printed)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
