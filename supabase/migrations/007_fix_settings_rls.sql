-- Fix RLS policies for products, packaging_styles, branding_styles
-- These tables only had SELECT policies, blocking INSERT/UPDATE from the settings page.

-- Products: add INSERT, UPDATE, DELETE policies
CREATE POLICY "Authenticated users can insert products"
  ON products FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update products"
  ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete products"
  ON products FOR DELETE TO authenticated USING (true);

-- Packaging styles: add INSERT, UPDATE, DELETE policies
CREATE POLICY "Authenticated users can insert packaging_styles"
  ON packaging_styles FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update packaging_styles"
  ON packaging_styles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete packaging_styles"
  ON packaging_styles FOR DELETE TO authenticated USING (true);

-- Branding styles: add INSERT, UPDATE, DELETE policies
CREATE POLICY "Authenticated users can insert branding_styles"
  ON branding_styles FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update branding_styles"
  ON branding_styles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete branding_styles"
  ON branding_styles FOR DELETE TO authenticated USING (true);
