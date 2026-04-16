-- === Migration 008: 回填庫存記錄的 date 欄位 ===
-- 將 inventory 和 packaging_material_inventory 中由訂單產生的記錄，
-- 其 date 欄位從 CURRENT_DATE（建立日）更正為對應訂單的 order_date。
-- 這讓 D+10 庫存查詢能正確按訂單日期篩選。

-- 1. 回填 inventory 的 date（product inventory）
UPDATE inventory i
SET date = o.order_date
FROM orders o
WHERE i.reference_note = 'order:' || o.id::text
  AND i.type = 'outbound';

-- 2. 回填 packaging_material_inventory 的 date（packaging material inventory）
UPDATE packaging_material_inventory pmi
SET date = o.order_date
FROM orders o
WHERE pmi.reference_note = 'order:' || o.id::text
  AND pmi.type = 'outbound';
