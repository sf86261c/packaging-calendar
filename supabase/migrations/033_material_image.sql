-- ════════════════════════════════════════════════════════════════════
-- Migration 033: 包材代表圖片
-- ════════════════════════════════════════════════════════════════════
-- 每個包材可上傳一張代表圖片，顯示於庫存卡片中（hover 放大）。
--
-- 1. packaging_materials.image_url：儲存 Supabase Storage 的 public URL
-- 2. Storage bucket：material-images（public read）
-- 3. RLS：anon + authenticated 可 SELECT/INSERT/UPDATE/DELETE
--    （與其它表一致，內部工具開放權限）
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE packaging_materials
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 建立 Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('material-images', 'material-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS policies（與既有 anon 全開設計一致）
-- 注意：若 policy 已存在會 error，故先 DROP
DROP POLICY IF EXISTS "Public read material images" ON storage.objects;
CREATE POLICY "Public read material images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'material-images');

DROP POLICY IF EXISTS "Anyone can upload material images" ON storage.objects;
CREATE POLICY "Anyone can upload material images"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'material-images');

DROP POLICY IF EXISTS "Anyone can update material images" ON storage.objects;
CREATE POLICY "Anyone can update material images"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'material-images');

DROP POLICY IF EXISTS "Anyone can delete material images" ON storage.objects;
CREATE POLICY "Anyone can delete material images"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'material-images');

-- 驗證
-- SELECT name, image_url FROM packaging_materials WHERE image_url IS NOT NULL;
