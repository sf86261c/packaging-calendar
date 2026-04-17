-- === Migration 011: stock_adjustments (試吃/耗損) ===

CREATE TABLE stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('sample', 'waste')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_stock_adjustments_date ON stock_adjustments(date);
CREATE INDEX idx_stock_adjustments_type_date ON stock_adjustments(adjustment_type, date);

CREATE TABLE stock_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  deduct_mode TEXT NOT NULL CHECK (deduct_mode IN ('finished', 'ingredient'))
);
CREATE INDEX idx_stock_adjustment_items_adjustment ON stock_adjustment_items(adjustment_id);

ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select stock_adjustments"
  ON stock_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert stock_adjustments"
  ON stock_adjustments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update stock_adjustments"
  ON stock_adjustments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete stock_adjustments"
  ON stock_adjustments FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can select stock_adjustment_items"
  ON stock_adjustment_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert stock_adjustment_items"
  ON stock_adjustment_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update stock_adjustment_items"
  ON stock_adjustment_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete stock_adjustment_items"
  ON stock_adjustment_items FOR DELETE TO authenticated USING (true);
