-- === Migration 014: 移除登入需求，RLS 開放給 anon 角色 ===
-- 由於前端已移除登入功能，所有資料表改為允許 anon + authenticated 雙角色存取。

-- 自動 drop 所有現有 policy 後，重建 FOR ALL TO public 的通行 policy。
DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
  tables TEXT[] := ARRAY[
    'products',
    'packaging_styles',
    'branding_styles',
    'orders',
    'order_items',
    'inventory',
    'packaging_materials',
    'packaging_material_inventory',
    'product_material_usage',
    'product_recipe',
    'stock_adjustments',
    'stock_adjustment_items'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    -- Drop every existing policy on this table
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    -- Create permissive policy for anon + authenticated
    EXECUTE format(
      'CREATE POLICY "Public full access" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      tbl
    );
  END LOOP;
END $$;
