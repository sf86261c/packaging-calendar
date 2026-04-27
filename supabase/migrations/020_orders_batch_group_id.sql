-- Migration 020: orders 加 batch_group_id (UUID)
--
-- 目的：用 UUID 群組 id 取代「customer_name + batch_info IS NOT NULL」這種脆弱的隱式匹配。
-- 規則：只有透過「分批/追加」按鈕產生的訂單才會被指派同一個 batch_group_id；
--       手動在備註欄輸入「追加」「分批1.」之類字串不會觸發任何綁定；
--       同名同姓但不同人不會被誤合併。
--
-- 既有訂單的 batch_group_id 預設為 NULL（不向前回填），
-- 使用者若需要把舊訂單關聯起來，從其中一筆按「分批/追加」按鈕重新分批即可。
--
-- 此 migration 為加欄位 + 索引，無破壞性改動，可在線上安全執行。

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS batch_group_id UUID;

-- 部分索引：只索引非 null 值，sibling 查詢效率高
CREATE INDEX IF NOT EXISTS idx_orders_batch_group_id
  ON orders(batch_group_id)
  WHERE batch_group_id IS NOT NULL;
