-- === Migration 012: stock_adjustment_items 新增 packaging_style_id ===
-- 用於試吃/耗損扣減成品時，指定包裝款式以扣對應的包材

ALTER TABLE stock_adjustment_items
  ADD COLUMN IF NOT EXISTS packaging_style_id UUID REFERENCES packaging_styles(id);
