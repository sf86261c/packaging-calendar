-- === Migration 009: 包材新增到貨時間欄位 ===
-- 用於 LINE 叫貨通知：只有在 D+lead_time_days 當天庫存低於安全庫存時才發送通知

ALTER TABLE packaging_materials
  ADD COLUMN IF NOT EXISTS lead_time_days INT NOT NULL DEFAULT 7;
