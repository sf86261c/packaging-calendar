# 包材自動扣減功能設計

## 概述

訂單建立/編輯/刪除時，根據 `product_material_usage` 對照表自動計算並扣減包材庫存，寫入 `packaging_material_inventory`。邏輯完全資料驅動，新增包材只需在 `/materials` 頁面設定用量對照即可自動生效。

## 方案

前端計算（方案 A），沿用現有產品庫存扣減模式，在 `src/app/calendar/[date]/page.tsx` 中新增包材扣減邏輯。

## 資料流

### 扣減流程（建立/編輯訂單）

1. 遍歷 order_items，取得 `(product_id, quantity)`
2. 根據產品類別取得對應 `packaging_style_id`：
   - `cake` → `orders.cake_packaging_id`
   - `tube` → `orders.tube_packaging_id`
   - `single_cake` → `order_items.packaging_id`（每筆各自）
   - `cookie` → `null`（無包裝款式）
   - `cake_bar` → 跳過（原料，不扣包材）
3. 查 `product_material_usage` WHERE `product_id = X` AND (`packaging_style_id = Y` OR `packaging_style_id IS NULL`)
4. 每筆 usage：`material_deduction = quantity × quantity_per_unit`
5. 按 `material_id` 匯總
6. 插入 `packaging_material_inventory`：
   - `type = 'outbound'`
   - `quantity = -N`
   - `reference_note = 'order:{orderId}'`

### 回沖流程（編輯/刪除訂單）

```sql
DELETE FROM packaging_material_inventory WHERE reference_note = 'order:{orderId}'
```

編輯時：回沖後重新計算並插入。

### packaging_style_id 匹配規則

- 精確匹配 `packaging_style_id = Y`：同產品不同包裝款式可能有不同包材組合
- 通用匹配 `packaging_style_id IS NULL`：不分包裝款式都需扣的包材（如底托、緩衝材）
- 兩者都查詢，結果合併計算

## 警示機制

- 訂單儲存成功後，檢查每個有數量的 `(product_id, packaging_style_id)` 是否有至少一筆 `product_material_usage` 記錄
- 無匹配的組合加入 `missingList`
- `missingList` 不為空時，顯示 toast 警示：列出缺少對照的產品+包裝款式名稱
- 不阻擋訂單儲存，不回滾

## 資料載入

頁面 `useEffect` 初始化時，額外 fetch `product_material_usage`：

```typescript
supabase
  .from('product_material_usage')
  .select('product_id, material_id, packaging_style_id, quantity_per_unit')
```

快取在 state 中，建單時直接查找。

## 新包材自動生效保證

- 扣減邏輯零硬編碼，唯一資料來源為 `product_material_usage` 表
- 新增包材流程：在 `/materials` 新增品項 → 設定用量對照 → 下次建單自動扣減
- `/materials` 頁面不需改動，現有 `SUM(quantity)` 計算自然包含新的 outbound 記錄

## 程式碼變更範圍

| 檔案 | 變更 |
|------|------|
| `src/app/calendar/[date]/page.tsx` | 新增 `calculateMaterialDeductions`、`applyMaterialDeductions`、`reverseMaterialDeductions` 函數，在現有扣減邏輯之後呼叫 |

## 不變動的部分

- `/materials` 頁面（庫存計算已涵蓋 outbound 記錄）
- `/inventory` 頁面（產品庫存，無關）
- DB schema（`packaging_material_inventory` 已支援 outbound + reference_note）
