-- Products master table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('cake', 'cookie', 'tube', 'pineapple')),
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Packaging styles
CREATE TABLE packaging_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color_code TEXT DEFAULT '#FFFFFF',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Branding styles
CREATE TABLE branding_styles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_date DATE NOT NULL,
  customer_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '待',
  batch_info TEXT,
  packaging_id UUID REFERENCES packaging_styles(id),
  branding_id UUID REFERENCES branding_styles(id),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid_printed', 'paid')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Order items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inventory records
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL CHECK (type IN ('inbound', 'outbound', 'adjustment')),
  quantity INT NOT NULL,
  reference_note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Packaging materials (framework - items to be added later)
CREATE TABLE packaging_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '個',
  safety_stock INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Packaging material inventory
CREATE TABLE packaging_material_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES packaging_materials(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL CHECK (type IN ('inbound', 'outbound', 'adjustment')),
  quantity INT NOT NULL,
  reference_note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Product-material usage mapping
CREATE TABLE product_material_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  material_id UUID NOT NULL REFERENCES packaging_materials(id),
  quantity_per_unit DECIMAL NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_orders_customer ON orders(customer_name);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_date ON inventory(date);
CREATE INDEX idx_pkg_mat_inv_material ON packaging_material_inventory(material_id);

-- Seed data: products
INSERT INTO products (category, name, sort_order) VALUES
  ('cake', '原味🍰', 1),
  ('cake', '紅茶🍰', 2),
  ('cake', '茉莉🍰', 3),
  ('cookie', '原味白🍪', 10),
  ('cookie', '可可粉🍪', 11),
  ('cookie', '伯爵藍🍪', 12),
  ('cookie', '綜合白🍪', 13),
  ('cookie', '綜合粉🍪', 14),
  ('cookie', '綜合藍🍪', 15),
  ('tube', '四季圓筒', 20),
  ('tube', '太空圓筒', 21);

-- Seed data: packaging styles
INSERT INTO packaging_styles (name, color_code) VALUES
  ('祝福緞帶(米)', '#F5F0E6'),
  ('森林旋律(粉)', '#FFE4E8'),
  ('歡樂派對(藍)', '#DBEAFE');

-- Seed data: branding styles
INSERT INTO branding_styles (name) VALUES
  ('A'), ('B'), ('C'),
  ('新A'), ('新B'),
  ('蛇'), ('蛇寶'), ('蛇年烙印');

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE packaging_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE branding_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE packaging_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE packaging_material_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_material_usage ENABLE ROW LEVEL SECURITY;

-- RLS policies: authenticated users can read/write all data
CREATE POLICY "Authenticated users can read products" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read packaging_styles" ON packaging_styles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read branding_styles" ON branding_styles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users full access orders" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access order_items" ON order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access inventory" ON inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access packaging_materials" ON packaging_materials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access packaging_material_inventory" ON packaging_material_inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users full access product_material_usage" ON product_material_usage FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
