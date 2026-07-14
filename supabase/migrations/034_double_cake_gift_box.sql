-- ════════════════════════════════════════════════════════════════════
-- Migration 034: 雙入蛋糕禮盒 → 獨立分類 double_cake ＋ 9 變體 SKU
-- ════════════════════════════════════════════════════════════════════
-- 背景：
--   舊品項「雙入蛋糕禮盒」(single_cake, id 0961077a-…) 配方被設成
--   三款蜂蜜蛋糕各扣 0.25（固定 BOM 表達不了「三選二」，導致每盒誤扣
--   0.75 條）。實際規則：選 2 款各扣 0.25（允許同口味×2），或
--   1 款 0.25 ＋ 午茶餅乾（純名稱佔位、不扣庫存）。
--
-- 本檔做六件事（單一交易）：
--   1. products.category CHECK 約束加入 'double_cake'（動態處理：正式庫
--      約束曾被 Dashboard 手改、與檔案史不符——004 插入 tube_pkg 為證）
--   2. 種入 9 個 double_cake 變體 SKU
--   3. 種入 12 筆 product_recipe（0.25 / 0.5 / 0.25＋餅乾不建列）
--   4. 複製舊品項 4 筆通用包材用量到 9 個新 SKU（共 36 筆）＋種子完整性斷言
--   5. 修正兩筆蘇玉芳訂單（7/14 cc1bb246、7/15 d6e6bd4b，皆「原+伯」）：
--      改掛正確變體並重算庫存——重算只在「本次確實改掛 2 筆」時執行；
--      並把舊品項改名「雙入蛋糕禮盒(舊-勿用)」防過渡期誤用（5c）
--   6. 守門式停用舊品項：引用歸零才停用（單行，引用>0 時自動 no-op）
--      （「月中試吃-7月」訂單 ebff6fd7 依業主指示維持掛舊品項，上線後由
--        操作者改成正確口味組合並重新扣帳；之後執行檔尾【完成步驟】單行
--        即停用，勿整檔重貼）
--
-- 註：inventory.quantity 為 integer 欄位（001 初始 schema），小數扣量
--     在寫入時四捨五入——7/15 量 446×0.25=111.5 → 存為 112，此為
--     app 既有行為（同一 RPC），非資料錯誤。
--
-- ⚠ 執行方式（務必照做）：
--   1) 整檔一次貼入 Supabase Dashboard SQL Editor 執行，禁止分段。
--      失敗時交易自動整體回滾（無半套狀態），修正問題後整檔重貼即可。
--   2) NOTICE 訊息在 Dashboard 可能不顯示——執行結果一律以檔尾
--      「驗證 ①-⑥」的 SELECT 為準。
--   3) 跑完後手動 GET /api/line-notify 發送校正後的叫貨通知
--      （今晨 09:00 的通知含幽靈茉莉扣量，已高估）。
--   4) 過渡期（本檔跑完 → 試吃單改掛完成前）：
--      · 舊品項會改名顯示為「雙入蛋糕禮盒(舊-勿用)」，仍出現在單入
--        區塊——勿用它下單，新單一律用新的「雙入蛋糕禮盒」區塊
--      · 操作者改掛前先重新整理頁面（舊分頁看不到新區塊）
--   5) 成功執行後請勿再整檔重貼；完成停用只需檔尾【完成步驟】那一行。
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 0. 自我防護：現有資料值必須 ⊆ 新約束清單，否則中止 ───────────

DO $$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(DISTINCT category, ', ') INTO bad
  FROM products
  WHERE category NOT IN
    ('cake','cake_bar','cookie','tube','tube_pkg','single_cake','pineapple','double_cake');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '034 中止：products.category 存在未列舉值 [%]，請人工核對後再執行', bad;
  END IF;
END;
$$;

-- ─── 1. 重建 category CHECK 約束（動態找名稱，不假設檔案史正確） ───

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT %I', c.conname);
  END LOOP;

  EXECUTE $sql$
    ALTER TABLE public.products
    ADD CONSTRAINT products_category_check CHECK (category IN
      ('cake','cake_bar','cookie','tube','tube_pkg','single_cake','pineapple','double_cake'))
  $sql$;
END;
$$;

-- ─── 2. 種入 9 個變體 SKU（已存在同名者跳過） ─────────────────────
-- 屬性照抄舊品項（safety_stock/lead_time/show_in_inventory/is_common
-- 對 double_cake 均為惰性欄位，僅求一致）

INSERT INTO products (name, category, sort_order, is_active, is_common,
                      safety_stock, lead_time_days, show_in_inventory)
SELECT v.name, 'double_cake', v.sort, true, true, 100, 15, true
FROM (VALUES
  ('雙入-經典原味+伯爵紅茶', 10),
  ('雙入-經典原味+茉莉花茶', 11),
  ('雙入-伯爵紅茶+茉莉花茶', 12),
  ('雙入-經典原味×2',       13),
  ('雙入-伯爵紅茶×2',       14),
  ('雙入-茉莉花茶×2',       15),
  ('雙入-經典原味+午茶餅乾', 16),
  ('雙入-伯爵紅茶+午茶餅乾', 17),
  ('雙入-茉莉花茶+午茶餅乾', 18)
) AS v(name, sort)
WHERE NOT EXISTS (
  SELECT 1 FROM products p
  WHERE p.category = 'double_cake' AND p.name = v.name
);

-- ─── 3. 種入配方（雙口味各 0.25／同口味 0.5／餅乾變體僅蛋糕 0.25） ──
-- 午茶餅乾為名稱佔位、不計庫存 → 不建 recipe 列（cookie 無配方之既有設計）

INSERT INTO product_recipe (product_id, ingredient_id, quantity_per_unit)
SELECT p.id, i.id, m.qty
FROM (VALUES
  ('雙入-經典原味+伯爵紅茶', '經典原味（條）', 0.25),
  ('雙入-經典原味+伯爵紅茶', '伯爵紅茶（條）', 0.25),
  ('雙入-經典原味+茉莉花茶', '經典原味（條）', 0.25),
  ('雙入-經典原味+茉莉花茶', '茉莉花茶（條）', 0.25),
  ('雙入-伯爵紅茶+茉莉花茶', '伯爵紅茶（條）', 0.25),
  ('雙入-伯爵紅茶+茉莉花茶', '茉莉花茶（條）', 0.25),
  ('雙入-經典原味×2',       '經典原味（條）', 0.5),
  ('雙入-伯爵紅茶×2',       '伯爵紅茶（條）', 0.5),
  ('雙入-茉莉花茶×2',       '茉莉花茶（條）', 0.5),
  ('雙入-經典原味+午茶餅乾', '經典原味（條）', 0.25),
  ('雙入-伯爵紅茶+午茶餅乾', '伯爵紅茶（條）', 0.25),
  ('雙入-茉莉花茶+午茶餅乾', '茉莉花茶（條）', 0.25)
) AS m(prod_name, ing_name, qty)
JOIN products p ON p.category = 'double_cake' AND p.name = m.prod_name
JOIN products i ON i.category = 'cake_bar'    AND i.name = m.ing_name
ON CONFLICT (product_id, ingredient_id) DO NOTHING;

-- ─── 4. 複製舊品項包材用量到 9 個新 SKU（只複製通用列） ─────────────
-- 比照 023：新 SKU 已有任何配方則整批跳過，避免覆蓋手動調整。
-- 只取 packaging_style_id IS NULL：撰寫時實查舊品項 4 筆皆通用列；
-- 若前提不成立（有款式綁定列），此過濾會使複製筆數不足 → 4b 的 c3
-- 斷言自動中止，fail-safe。

INSERT INTO product_material_usage (product_id, material_id, packaging_style_id, quantity_per_unit)
SELECT new_p.id, pmu.material_id, pmu.packaging_style_id, pmu.quantity_per_unit
FROM products new_p
JOIN product_material_usage pmu
  ON pmu.product_id = '0961077a-761e-4686-8017-353a4e5ee364'  -- 舊「雙入蛋糕禮盒」
  AND pmu.packaging_style_id IS NULL
WHERE new_p.category = 'double_cake'
  AND NOT EXISTS (
    SELECT 1 FROM product_material_usage existing
    WHERE existing.product_id = new_p.id
  );

-- ─── 4b. 種子完整性斷言：名稱 JOIN 落空會靜默漏種，這裡擋下 ─────────
-- （若配方漏種，5b 會以空字典清空訂單原料扣帳——此斷言封死該路徑）

DO $$
DECLARE
  c1 int; c2 int; c3 int;
BEGIN
  SELECT count(*) INTO c1 FROM products WHERE category = 'double_cake';
  SELECT count(*) INTO c2
  FROM product_recipe r JOIN products p ON p.id = r.product_id
  WHERE p.category = 'double_cake';
  SELECT count(*) INTO c3
  FROM product_material_usage
  WHERE product_id = (SELECT id FROM products
                      WHERE category = 'double_cake' AND name = '雙入-經典原味+伯爵紅茶');
  IF c1 < 9 OR c2 < 12 OR c3 < 4 THEN
    RAISE EXCEPTION '034 中止：種子不完整（SKU %/9、配方 %/12、原+伯包材 %/4）——多半是品項名稱與正式庫不吻合造成 JOIN 落空，請人工核對', c1, c2, c3;
  END IF;
END;
$$;

-- ─── 5a. 兩筆蘇玉芳訂單改掛正確變體（業主確認皆為「原+伯」） ─────────
-- 以 (order_id, product_id) 定位——item UUID 在編輯/分批流程會刪除重插、
-- 不穩定；order id 恆定。一併清空 packaging_id（雙入無包裝款式概念；
-- 兩筆原值均為 3ec49728-…，回滾用）。
-- 影響列數斷言：首次執行=2、已改掛後=0，其他值代表訂單被改過，中止人工核對。
-- 改掛筆數經 set_config 傳給 5b：庫存重算只在「本次確實改掛」時執行。

DO $$
DECLARE
  n int;
BEGIN
  UPDATE order_items
  SET product_id = (SELECT id FROM products
                    WHERE category = 'double_cake' AND name = '雙入-經典原味+伯爵紅茶'),
      packaging_id = NULL
  WHERE order_id IN ('cc1bb246-a34a-4940-b62e-cb3deb8f3ef8',   -- 7/14, qty 264
                     'd6e6bd4b-9089-4f99-a0a2-ec84463eea1e')   -- 7/15, qty 446
    AND product_id = '0961077a-761e-4686-8017-353a4e5ee364';

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n NOT IN (0, 2) THEN
    RAISE EXCEPTION '034 中止：5a 預期改掛 0 或 2 筆，實際 % 筆——訂單內容與撰寫時不符，請人工核對兩筆蘇玉芳訂單後再執行', n;
  END IF;
  PERFORM set_config('app.migration_034_repointed', n::text, true);
END;
$$;

-- ─── 5b. 重算兩張訂單庫存（僅在 5a 本次改掛 2 筆時執行） ─────────────
-- 用既有 RPC replace_order_inventory（migration 016）＝與 app 同一套
-- 數學、同一原子機制。包材公式只取通用列 (packaging_style_id IS NULL)，
-- 前提是「兩單品項全為雙入」——執行前斷言，且只在剛完成改掛的同一跑
-- 重算（避免日後誤重跑時，用過期公式覆寫 app 已寫正確的帳）。
-- 預期結果（量 264/446 未變動的前提下）：
--   7/14 inventory：經典原味 -66、伯爵紅茶 -66（茉莉花茶列消失）
--   7/15 inventory：經典原味 -112、伯爵紅茶 -112（111.5 → 112；茉莉花茶列消失）
--   包材帳兩單維持 528/528/528/264 與 892/892/892/446（重算值相同）

DO $$
DECLARE
  n int := COALESCE(NULLIF(current_setting('app.migration_034_repointed', true), ''), '0')::int;
  bad int;
  o record;
BEGIN
  IF n <> 2 THEN
    RAISE NOTICE '5b 略過：本次未執行改掛（n=%），不重算庫存', n;
    RETURN;
  END IF;

  SELECT count(*) INTO bad
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  WHERE oi.order_id IN ('cc1bb246-a34a-4940-b62e-cb3deb8f3ef8',
                        'd6e6bd4b-9089-4f99-a0a2-ec84463eea1e')
    AND p.category <> 'double_cake';
  IF bad > 0 THEN
    RAISE EXCEPTION '034 中止：蘇玉芳訂單含 % 筆非雙入品項，5b 包材公式前提不成立。解法三步：① 在 app 編輯該訂單，把非雙入品項的數量記下並暫時歸零存檔 ② 重新整檔貼上執行 034 ③ 成功後回 app（先重新整理頁面）把品項補回並重存', bad;
  END IF;

  FOR o IN
    SELECT id, order_date FROM orders
    WHERE id IN ('cc1bb246-a34a-4940-b62e-cb3deb8f3ef8',
                 'd6e6bd4b-9089-4f99-a0a2-ec84463eea1e')
  LOOP
    PERFORM replace_order_inventory(
      o.id,
      (SELECT COALESCE(jsonb_object_agg(t.ingredient_id::text, t.qty), '{}'::jsonb)
       FROM (SELECT r.ingredient_id,
                    ROUND(SUM(oi.quantity * r.quantity_per_unit)::numeric, 2) AS qty
             FROM order_items oi
             JOIN product_recipe r ON r.product_id = oi.product_id
             WHERE oi.order_id = o.id
             GROUP BY r.ingredient_id) t),
      (SELECT COALESCE(jsonb_object_agg(t.material_id::text, t.qty), '{}'::jsonb)
       FROM (SELECT pmu.material_id,
                    ROUND(SUM(oi.quantity * pmu.quantity_per_unit)::numeric, 2) AS qty
             FROM order_items oi
             JOIN product_material_usage pmu
               ON pmu.product_id = oi.product_id AND pmu.packaging_style_id IS NULL
             WHERE oi.order_id = o.id
             GROUP BY pmu.material_id) t),
      o.order_date
    );
  END LOOP;
END;
$$;

-- ─── 5c. 過渡防呆：舊品項改名，操作者在單入區塊一眼識別勿用 ─────────
-- app 全以 id/category 匹配產品（已 grep 實證無任何依賴「雙入蛋糕禮盒」
-- 字串的匹配邏輯），改名純顯示層；「月中試吃-7月」的品項列也會顯示
-- 新名稱，自帶「待改掛」訊號。名稱守門使重跑為 no-op。

UPDATE products SET name = '雙入蛋糕禮盒(舊-勿用)'
WHERE id = '0961077a-761e-4686-8017-353a4e5ee364'
  AND name = '雙入蛋糕禮盒';

-- ─── 6. 守門式停用舊品項（引用>0 時自動 no-op，不擋交易） ───────────
-- 「月中試吃-7月」(order ebff6fd7-eedc-4b58-9206-c86a85ae3ed5, 7/14,
-- qty 334) 依業主指示維持掛舊品項，上線後由操作者在訂單編輯中：
-- 重新整理頁面 → 歸零舊品項 → 改填正確變體 → 存檔（存檔即正確重算）。
-- 改掛完成後執行檔尾【完成步驟】單行即停用，勿整檔重貼。

UPDATE products SET is_active = false
WHERE id = '0961077a-761e-4686-8017-353a4e5ee364'
  AND NOT EXISTS (SELECT 1 FROM order_items
                  WHERE product_id = '0961077a-761e-4686-8017-353a4e5ee364');

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- 【完成步驟】試吃單改掛完成後，單獨執行下面這一行（自帶守門：
--   仍有引用時不會停用）。執行後跑驗證④確認 is_active = false。
-- ════════════════════════════════════════════════════════════════════
-- UPDATE products SET is_active = false
-- WHERE id = '0961077a-761e-4686-8017-353a4e5ee364'
--   AND NOT EXISTS (SELECT 1 FROM order_items
--                   WHERE product_id = '0961077a-761e-4686-8017-353a4e5ee364');
--
-- ════════════════════════════════════════════════════════════════════
-- 驗證（執行後逐段跑，人工核對）
-- ════════════════════════════════════════════════════════════════════
-- ① 9 個 SKU＋12 筆配方：
-- SELECT p.name, i.name AS ingredient, r.quantity_per_unit
-- FROM products p
-- LEFT JOIN product_recipe r ON r.product_id = p.id
-- LEFT JOIN products i ON i.id = r.ingredient_id
-- WHERE p.category = 'double_cake' ORDER BY p.sort_order, i.name;
--
-- ② 包材 36 筆：
-- SELECT count(*) FROM product_material_usage pmu
-- JOIN products p ON p.id = pmu.product_id WHERE p.category = 'double_cake';
--
-- ③ 兩張蘇玉芳訂單庫存（應各 2 列、無茉莉花茶；量未變動時
--    7/14 = -66/-66、7/15 = -112/-112）：
-- SELECT i.reference_note, p.name, i.quantity, i.date
-- FROM inventory i JOIN products p ON p.id = i.product_id
-- WHERE i.reference_note IN ('order:cc1bb246-a34a-4940-b62e-cb3deb8f3ef8',
--                            'order:d6e6bd4b-9089-4f99-a0a2-ec84463eea1e')
-- ORDER BY i.date, p.name;
--
-- ④ 舊品項引用數與停用狀態（改掛「月中試吃-7月」前 count=1、is_active=true；
--    改掛＋執行【完成步驟】後 count=0、is_active=false）：
-- SELECT count(*) FROM order_items WHERE product_id = '0961077a-761e-4686-8017-353a4e5ee364';
-- SELECT is_active FROM products WHERE id = '0961077a-761e-4686-8017-353a4e5ee364';
--
-- ⑤ 「月中試吃-7月」在操作者改掛前應維持原扣帳（三口味各 -84）：
-- SELECT p.name, i.quantity FROM inventory i JOIN products p ON p.id = i.product_id
-- WHERE i.reference_note = 'order:ebff6fd7-eedc-4b58-9206-c86a85ae3ed5';
--
-- ⑥ 兩張蘇玉芳訂單包材帳（量未變動時 7/14 = -528/-528/-528/-264、
--    7/15 = -892/-892/-892/-446，各 4 列）：
-- SELECT reference_note, material_id, quantity, date
-- FROM packaging_material_inventory
-- WHERE reference_note IN ('order:cc1bb246-a34a-4940-b62e-cb3deb8f3ef8',
--                          'order:d6e6bd4b-9089-4f99-a0a2-ec84463eea1e')
-- ORDER BY date, material_id;
--
-- ════════════════════════════════════════════════════════════════════
-- 回滾（如需還原，整段依序執行；⚠ 執行前先人工確認兩張蘇玉芳訂單
-- 各自僅持有 1 筆雙入品項——order_items 無 (order_id, product_id) 唯一
-- 約束，多變體塌縮回同一舊品項會產生重複列，之後編輯會靜默丟量。
-- 另註：若「月中試吃-7月」已改掛變體才回滾，該單所掛變體因仍被引用
-- 不會被步驟 4 刪除——舊品項與部分變體並存屬預期混合態，資料安全）
-- ════════════════════════════════════════════════════════════════════
-- BEGIN;
-- -- 1) 重新啟用舊品項並還原名稱（若已被停用/改名）
-- UPDATE products SET is_active = true, name = '雙入蛋糕禮盒'
-- WHERE id = '0961077a-761e-4686-8017-353a4e5ee364';
-- -- 2) 兩筆蘇玉芳訂單改掛回舊品項並還原包裝（只鎖兩張蘇單，不觸試吃單）
-- UPDATE order_items
-- SET product_id = '0961077a-761e-4686-8017-353a4e5ee364',
--     packaging_id = '3ec49728-fa1b-46a4-8367-8c590a5c2de2'
-- WHERE order_id IN ('cc1bb246-a34a-4940-b62e-cb3deb8f3ef8',
--                    'd6e6bd4b-9089-4f99-a0a2-ec84463eea1e')
--   AND product_id IN (SELECT id FROM products WHERE category = 'double_cake');
-- -- 3) 【必跑，不可省略】以舊配方重算兩單庫存：先重新整理頁面（stale
-- --    分頁的 products 快取缺舊品項，重存會靜默丟包材帳），再於 app 中
-- --    開啟兩張訂單各重存一次即完成重算（走 app 原生路徑，最不易出錯；
-- --    本檔 5b 的 SQL 重算刻意只在首跑改掛時執行，回滾情境不適用）
-- -- 4) 刪除 9 個變體（僅在無訂單引用時）
-- DELETE FROM product_material_usage WHERE product_id IN
--   (SELECT id FROM products p WHERE p.category = 'double_cake'
--    AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id));
-- DELETE FROM product_recipe WHERE product_id IN
--   (SELECT id FROM products p WHERE p.category = 'double_cake'
--    AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id));
-- DELETE FROM products p WHERE p.category = 'double_cake'
--   AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.product_id = p.id);
-- -- 5) CHECK 約束留著 double_cake 無害，不需還原
-- COMMIT;
