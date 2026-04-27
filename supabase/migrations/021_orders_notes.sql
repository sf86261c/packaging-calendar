-- Migration 021: orders 加 notes TEXT
--
-- 目的：保留原 batch_info 中夾雜的非數字備註(例如「分批1取+寄」「*奶曲-藍」「單入」),
--       讓「同名同姓客戶綁定 + 重編號」的批次資料整理腳本不會把這些備註吃掉。
--
-- 加欄位 + IF NOT EXISTS,可重複執行,無破壞性。
-- 預設 NULL,既有訂單不需回填。

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS notes TEXT;
