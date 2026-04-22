-- ════════════════════════════════════════════════════════════════════
-- Migration 016: 庫存扣減 RPC functions（atomic transaction）
-- ════════════════════════════════════════════════════════════════════
-- 目的：
--   原本的 reverse + apply 流程是兩段獨立 await，網路斷線/tab 關閉
--   可能在 reverse 之後沒有 apply，導致 inventory 永久遺失。
--
-- 對策：
--   把 DELETE old + INSERT new 包進 plpgsql function，
--   Postgres function 預設整個 body 即為一個 transaction，
--   失敗會自動 rollback，inventory 不會處於半套狀態。
--
-- Functions：
--   replace_order_inventory       — 訂單編輯/重算
--   replace_adjustment_inventory  — 試吃/耗損/散單編輯
--   delete_order_with_inventory   — 訂單刪除（連帶 inventory）
--   delete_adjustment_with_inventory — 調整刪除（連帶 inventory）
--
-- 輸入：
--   ingredient_deductions / material_deductions 為 jsonb 字典
--   {"<uuid>": qty, "<uuid>": qty}
-- ════════════════════════════════════════════════════════════════════

-- ─── 訂單 ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION replace_order_inventory(
  p_order_id uuid,
  p_ingredient_deductions jsonb,
  p_material_deductions jsonb,
  p_date date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. 刪舊
  DELETE FROM inventory
   WHERE reference_note = 'order:' || p_order_id::text;
  DELETE FROM packaging_material_inventory
   WHERE reference_note = 'order:' || p_order_id::text;

  -- 2. 插新 ingredient
  IF p_ingredient_deductions IS NOT NULL AND jsonb_typeof(p_ingredient_deductions) = 'object' THEN
    INSERT INTO inventory (product_id, date, type, quantity, reference_note)
    SELECT
      (key)::uuid,
      p_date,
      'outbound',
      -ROUND((value::text)::numeric, 2),
      'order:' || p_order_id::text
    FROM jsonb_each(p_ingredient_deductions)
    WHERE (value::text)::numeric > 0;
  END IF;

  -- 3. 插新 material
  IF p_material_deductions IS NOT NULL AND jsonb_typeof(p_material_deductions) = 'object' THEN
    INSERT INTO packaging_material_inventory (material_id, date, type, quantity, reference_note)
    SELECT
      (key)::uuid,
      p_date,
      'outbound',
      -ROUND((value::text)::numeric, 2),
      'order:' || p_order_id::text
    FROM jsonb_each(p_material_deductions)
    WHERE (value::text)::numeric > 0;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION delete_order_with_inventory(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM inventory
   WHERE reference_note = 'order:' || p_order_id::text;
  DELETE FROM packaging_material_inventory
   WHERE reference_note = 'order:' || p_order_id::text;
  DELETE FROM orders WHERE id = p_order_id;
END;
$$;

-- ─── 試吃/耗損/散單 ────────────────────────────────────

CREATE OR REPLACE FUNCTION replace_adjustment_inventory(
  p_adjustment_id uuid,
  p_ingredient_deductions jsonb,
  p_material_deductions jsonb,
  p_date date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM inventory
   WHERE reference_note = 'adjust:' || p_adjustment_id::text;
  DELETE FROM packaging_material_inventory
   WHERE reference_note = 'adjust:' || p_adjustment_id::text;

  IF p_ingredient_deductions IS NOT NULL AND jsonb_typeof(p_ingredient_deductions) = 'object' THEN
    INSERT INTO inventory (product_id, date, type, quantity, reference_note)
    SELECT
      (key)::uuid,
      p_date,
      'outbound',
      -ROUND((value::text)::numeric, 2),
      'adjust:' || p_adjustment_id::text
    FROM jsonb_each(p_ingredient_deductions)
    WHERE (value::text)::numeric > 0;
  END IF;

  IF p_material_deductions IS NOT NULL AND jsonb_typeof(p_material_deductions) = 'object' THEN
    INSERT INTO packaging_material_inventory (material_id, date, type, quantity, reference_note)
    SELECT
      (key)::uuid,
      p_date,
      'outbound',
      -ROUND((value::text)::numeric, 2),
      'adjust:' || p_adjustment_id::text
    FROM jsonb_each(p_material_deductions)
    WHERE (value::text)::numeric > 0;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION delete_adjustment_with_inventory(p_adjustment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM inventory
   WHERE reference_note = 'adjust:' || p_adjustment_id::text;
  DELETE FROM packaging_material_inventory
   WHERE reference_note = 'adjust:' || p_adjustment_id::text;
  DELETE FROM stock_adjustments WHERE id = p_adjustment_id;
END;
$$;

-- ─── 權限 ──────────────────────────────────────────────
-- 因前端使用 anon role，需明確授權

GRANT EXECUTE ON FUNCTION replace_order_inventory(uuid, jsonb, jsonb, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_order_with_inventory(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_adjustment_inventory(uuid, jsonb, jsonb, date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION delete_adjustment_with_inventory(uuid) TO anon, authenticated;
