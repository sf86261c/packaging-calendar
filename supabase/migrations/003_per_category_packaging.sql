-- ============================================
-- Migration 003: Per-category packaging/branding fields on orders
-- ============================================

-- Replace single packaging_id/branding_id with per-category fields
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cake_packaging_id UUID REFERENCES packaging_styles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cake_branding_id UUID REFERENCES branding_styles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tube_packaging_id UUID REFERENCES packaging_styles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS single_cake_packaging_id UUID REFERENCES packaging_styles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS single_cake_branding_text TEXT;

-- Drop old columns (safe since we just cleared all orders in migration 002)
ALTER TABLE orders DROP COLUMN IF EXISTS packaging_id;
ALTER TABLE orders DROP COLUMN IF EXISTS branding_id;
