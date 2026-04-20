-- === Migration 013: 擴充 adjustment_type 支援散單(retail) ===

ALTER TABLE stock_adjustments
  DROP CONSTRAINT IF EXISTS stock_adjustments_adjustment_type_check;

ALTER TABLE stock_adjustments
  ADD CONSTRAINT stock_adjustments_adjustment_type_check
  CHECK (adjustment_type IN ('sample', 'waste', 'retail'));
