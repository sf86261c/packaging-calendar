-- ════════════════════════════════════════════════════════════════════
-- Migration 015: 修正 tube_pkg 產品資料
-- ════════════════════════════════════════════════════════════════════
-- 問題：
--   1. 三個 tube_pkg 產品（四季童話 / 銀河探險 / 馬戲團）全部 is_active=false
--   2. packaging_styles 中「馬戲團」已改名為「樂園馬戲」，product 名稱沒對齊
--   結果：所有旋轉筒訂單未實際扣減 tube_pkg 包裝庫存（按名稱比對失敗）
--
-- 修正：啟用三個 tube_pkg + 對齊新名稱
-- ════════════════════════════════════════════════════════════════════

-- 1. 啟用所有 tube_pkg 產品
UPDATE products
SET is_active = true
WHERE category = 'tube_pkg';

-- 2. 對齊新名稱：「馬戲團」→「樂園馬戲」
UPDATE products
SET name = '樂園馬戲'
WHERE category = 'tube_pkg' AND name = '馬戲團';

-- 3. 驗證（執行後應顯示三筆 active 的 tube_pkg）
-- SELECT name, is_active FROM products WHERE category = 'tube_pkg' ORDER BY sort_order;
-- 預期：四季童話 (true) / 銀河探險 (true) / 樂園馬戲 (true)

-- 4. 驗證對應（應該全部對應到）
-- SELECT ps.name AS pkg_style, p.name AS tube_pkg_product, p.is_active
-- FROM packaging_styles ps
-- LEFT JOIN products p ON p.category = 'tube_pkg' AND p.name = ps.name
-- WHERE ps.category = 'tube' AND ps.is_active = true;
