-- ════════════════════════════════════════════════════════════════════
-- Migration 032: 包材水源庫存
-- ════════════════════════════════════════════════════════════════════
-- 「水源庫存」表示在另一處（如代工廠 / 上游倉庫）尚有庫存的數量，
-- 計入「總庫存 = 現有 + 水源」用於 D+N 比對。
--
-- has_water_source：是否啟用此功能（控制 UI 顯示）
-- water_source_quantity：水源數量（單值，非紀錄）
--
-- 用法：
--   - 包材入庫時可選「入庫到水源」→ water_source_quantity += qty
--   - 「庫存轉移」按鈕：寫一筆 inbound record (+W) 到 packaging_material_inventory，
--     並把 water_source_quantity 歸零；總庫存不變
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE packaging_materials
  ADD COLUMN IF NOT EXISTS has_water_source BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS water_source_quantity INT NOT NULL DEFAULT 0;

-- 驗證
-- SELECT name, has_water_source, water_source_quantity FROM packaging_materials WHERE has_water_source;
