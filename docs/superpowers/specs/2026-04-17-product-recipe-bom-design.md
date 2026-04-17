# Product Recipe BOM + 今日試吃/耗損 — Design Doc

**Date**: 2026-04-17
**Author**: sf862 + Claude
**Status**: Pending approval

---

## 背景與動機

目前「產品原料消耗規則」硬編碼在 `src/app/calendar/[date]/page.tsx`：

| 類別 | 硬編碼規則 |
|------|-----------|
| `cake`（盒） | 每口味扣 1 條 `cake_bar`（盒=2條，透過名稱解析口味） |
| `tube`（筒） | 1 條 `cake_bar`（對應口味） + 1 個 `tube_pkg`（對應包裝） |
| `single_cake`（單入） | 0.25 條 `cake_bar`（對應口味） |
| `cookie`（曲奇） | 不扣原料 |

**問題**：新增「蜂蜜蛋糕試吃盒」（1 條經典 + 0.5 條伯爵 + 0.5 條茉莉，混合口味）這類產品時，硬編碼規則無法表達任意配方。且新增產品只能透過 `/settings` 填基本資訊，包材對照還要另外到 `/materials` 頁面設定。

**本次重構**：
1. 原料消耗改為資料驅動（新表 `product_recipe`）
2. 現有硬編碼規則一次性遷移為資料紀錄
3. `/settings` 新增產品流程擴充為同時設定「原料配方 + 包材用量」
4. `/calendar/[date]` 新增「今日試吃/耗損」功能（非訂單類型庫存扣減）
5. 試吃/耗損分開記錄
6. `/dashboard` 新增試吃統計圖表

---

## 需求摘要

| # | 需求 | 影響範圍 |
|---|------|---------|
| 1 | 通用化新增產品：可自訂原料 + 包材消耗 | `/settings`、新表 |
| 2 | 現有硬編碼規則一次性遷移至資料表 | Migration 010 |
| 3 | 訂單扣減改為資料驅動 | `/calendar/[date]`、共用 helper |
| 4 | 日期頁面新增「今日試吃/耗損」扣減流程 | `/calendar/[date]`、新表 |
| 5 | 試吃與耗損分開記錄 | `adjustment_type` 欄位 |
| 6 | 儀表板新增試吃統計圖表 | `/dashboard` |

**非範圍**：
- 不含包材耗損（包材耗損情境另於 `/materials` 處理）
- 不含 `tube_pkg` 消耗資料化（維持現有「按包裝款式名稱匹配同名 tube_pkg」硬編碼）
- 不含耗損統計圖表
- 不含試吃/耗損的 CSV 匯出

---

## Section 1 — 資料結構

### 新表：`product_recipe`（原料配方）

```sql
CREATE TABLE product_recipe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_per_unit NUMERIC NOT NULL CHECK (quantity_per_unit > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, ingredient_id)
);
CREATE INDEX idx_product_recipe_product ON product_recipe(product_id);
```

**設計取捨**：

- `ingredient_id` 直接指向 `products.id`（限 `cake_bar` 或 `tube_pkg` 類別）；不另建原料主檔，因為這些產品本身已在 `products` 表受庫存追蹤。
- **不含 `packaging_style_id`**：原料消耗與包裝無關（同一產品不同包裝、原料量不變）。包材對照才需要 `packaging_style_id`，這個差異讓兩張表分開比合併乾淨。
- `UNIQUE (product_id, ingredient_id)`：一個產品對同一原料只能有一筆配方，避免重複。
- `ON DELETE CASCADE` on `product_id`：刪除產品時自動清除配方。
- `ON DELETE RESTRICT` on `ingredient_id`：防止原料被意外刪除。

### 保留表：`product_material_usage`（包材對照）

不變動。繼續使用 `product_id + packaging_style_id + material_id + quantity_per_unit` 結構。

### 新表：`stock_adjustments` + `stock_adjustment_items`（試吃/耗損）

```sql
CREATE TABLE stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('sample', 'waste')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_stock_adjustments_date ON stock_adjustments(date);
CREATE INDEX idx_stock_adjustments_type_date ON stock_adjustments(adjustment_type, date);

CREATE TABLE stock_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  deduct_mode TEXT NOT NULL CHECK (deduct_mode IN ('finished', 'ingredient'))
);
CREATE INDEX idx_stock_adjustment_items_adjustment ON stock_adjustment_items(adjustment_id);
```

**設計取捨**：

- **父子結構**（對照 `orders` / `order_items`）：一筆調整可含多個 item（批次扣：例如一次活動同時扣 3 盒試吃 + 2 條原料報廢）。
- `adjustment_type`：`sample`（試吃）/ `waste`（耗損）分開，未來可做獨立報表。
- `deduct_mode`：
  - `finished` — 扣成品，透過 `product_recipe` 展開為原料扣減 + 透過 `product_material_usage` 展開為包材扣減
  - `ingredient` — 扣原料，直接扣 `product_id` 對應的 inventory（限 `cake_bar` / `tube_pkg`）

---

## Section 2 — Migration 010: product_recipe

檔案：`supabase/migrations/010_product_recipe.sql`

```sql
-- === Migration 010: product_recipe (原料配方) ===

-- 1. 建表
CREATE TABLE product_recipe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_per_unit NUMERIC NOT NULL CHECK (quantity_per_unit > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, ingredient_id)
);
CREATE INDEX idx_product_recipe_product ON product_recipe(product_id);

-- 2. RLS
ALTER TABLE product_recipe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth select" ON product_recipe FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert" ON product_recipe FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update" ON product_recipe FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete" ON product_recipe FOR DELETE TO authenticated USING (true);

-- 3. Seed 既有 12 個成品產品的配方
-- cake（6 產品）
--   組合盒「A+B」→ A × 1 + B × 1
--   單口味盒「A」→ A × 2
INSERT INTO product_recipe (product_id, ingredient_id, quantity_per_unit)
SELECT c.id, cb.id, CASE
  WHEN c.name = cb.name THEN 2
  WHEN c.name LIKE cb.name || '+%' THEN 1
  WHEN c.name LIKE '%+' || cb.name THEN 1
END
FROM products c
JOIN products cb ON cb.category = 'cake_bar'
WHERE c.category = 'cake'
  AND (c.name = cb.name OR c.name LIKE cb.name || '+%' OR c.name LIKE '%+' || cb.name);

-- tube（3 產品：旋轉筒-<口味>）
INSERT INTO product_recipe (product_id, ingredient_id, quantity_per_unit)
SELECT t.id, cb.id, 1
FROM products t
JOIN products cb ON cb.category = 'cake_bar'
WHERE t.category = 'tube'
  AND REPLACE(t.name, '旋轉筒-', '') = cb.name;

-- single_cake（3 產品：單入-<口味>）
INSERT INTO product_recipe (product_id, ingredient_id, quantity_per_unit)
SELECT s.id, cb.id, 0.25
FROM products s
JOIN products cb ON cb.category = 'cake_bar'
WHERE s.category = 'single_cake'
  AND REPLACE(s.name, '單入-', '') = cb.name;

-- cookie / cake_bar / tube_pkg 無 recipe（不 insert）
```

**遷移範圍界定**：

- `tube` 的 `tube_pkg` 消耗**不**進 recipe（它是 per-packaging 屬性，需要 `packaging_style_id`）；保留現有「按訂單 `tube_packaging_id` 對應包裝款式名稱，匹配同名 `tube_pkg` 產品」邏輯。
- `cake_bar` / `tube_pkg` 自身無 recipe（自己即為原料）。
- `cookie` 無原料配方（只有包材消耗，繼續走 `product_material_usage`）。

**驗證 seed 正確性**：migration 執行後 `product_recipe` 應有 18 筆紀錄：

| 類別 | 產品數 | 每個產品紀錄數 | 小計 |
|------|-------|--------------|------|
| cake（組合盒） | 3 | 2（兩個口味） | 6 |
| cake（單口味盒） | 3 | 1 | 3 |
| tube | 3 | 1 | 3 |
| single_cake | 3 | 1 | 3 |
| **合計** | | | **15** |

> 實際應為 15 筆（不含 cookie/cake_bar/tube_pkg）。

---

## Section 3 — Migration 011: stock_adjustments

檔案：`supabase/migrations/011_stock_adjustments.sql`

```sql
-- === Migration 011: stock_adjustments (試吃/耗損) ===

CREATE TABLE stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('sample', 'waste')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_stock_adjustments_date ON stock_adjustments(date);
CREATE INDEX idx_stock_adjustments_type_date ON stock_adjustments(adjustment_type, date);

CREATE TABLE stock_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  deduct_mode TEXT NOT NULL CHECK (deduct_mode IN ('finished', 'ingredient'))
);
CREATE INDEX idx_stock_adjustment_items_adjustment ON stock_adjustment_items(adjustment_id);

-- RLS
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth all" ON stock_adjustments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth all" ON stock_adjustment_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

---

## Section 4 — 設定頁面 UI 改造

影響檔案：`src/app/settings/page.tsx`

### 新增產品 Dialog 擴充

```
┌ 新增產品 ──────────────────────┐
│ 分類：[▼ 選擇分類          ]    │
│ 名稱：[                      ]  │
│                                 │
│ ─── 原料消耗（可選）────────     │
│  [▼ 原料產品] [數量] [×]        │
│  [+ 新增原料]                   │
│                                 │
│ ─── 包材消耗（可選）────────     │
│  [▼ 包材] [數量] [▼ 包裝] [×]   │
│  [+ 新增包材]                   │
│                                 │
│         [取消]    [新增]        │
└────────────────────────────────┘
```

**欄位行為**：

- **分類選到 `cake_bar` / `tube_pkg`** → 隱藏兩個區塊（自己是原料）。
- **原料產品下拉**：`category IN ('cake_bar', 'tube_pkg')` 且 `is_active = true`。
- **包材下拉**：`packaging_materials` 且 `is_active = true`。
- **包裝款式下拉**：依當前產品分類過濾 `packaging_styles.category`；另含「套用全部」選項（= `NULL`）。
- **數量欄**：允許小數（例如 0.25、0.5、1.5）。

**儲存流程**（三段寫入，前端組 transaction）：

1. `insert into products (category, name, sort_order)` → 取得 `new_product_id`
2. 批次 `insert into product_recipe` — 針對原料區每一行
3. 批次 `insert into product_material_usage` — 針對包材區每一行

若任一步失敗：刪除已建立的 `products` 紀錄（補償交易）+ 顯示錯誤訊息。

### 編輯既有產品「配方」

每個產品 Badge 旁新增「📋 配方」小按鈕 → 打開同 Dialog，並預填：

- 讀取 `product_recipe WHERE product_id = ?` 填入原料區
- 讀取 `product_material_usage WHERE product_id = ?` 填入包材區

**儲存行為**：

- `products`：update name / is_active（既有行內編輯保留）
- `product_recipe`：delete by `product_id` → 批次 insert new
- `product_material_usage`：delete by `product_id` → 批次 insert new

**取捨**：為什麼不 diff-based upsert？因為 recipe 條目少（每個產品通常 ≤5 行），delete-insert 邏輯簡單可靠，不值得 diff 複雜度。

### `/materials` 頁面不動

「用量對照」Dialog 與 `product_material_usage` 讀寫不變。兩處（`/settings` 與 `/materials`）可讀寫同一張表，各自以不同角度展示（`/settings` 按產品、`/materials` 按包材）。

---

## Section 5 — 日期頁面 UI 改造

影響檔案：`src/app/calendar/[date]/page.tsx`

### 頂部按鈕列新增按鈕

```
[匯出CSV]  [新增訂單]  [今日試吃/耗損]
```

### Dialog

```
┌ 今日試吃 / 耗損 ────────────────┐
│ 類型：(●) 試吃   (○) 耗損       │
│ 備註：[                      ]  │
│                                 │
│ ─── 扣減項目 ──────────────     │
│ (●成品 ○原料) [▼產品] [數量] ×  │
│ (○成品 ●原料) [▼產品] [數量] ×  │
│ [+ 新增項目]                    │
│                                 │
│         [取消]    [儲存]        │
└────────────────────────────────┘
```

**行為**：

- **扣成品** → 產品下拉列出 `category IN ('cake', 'tube', 'cookie', 'single_cake')`，儲存時 `deduct_mode = 'finished'`。
- **扣原料** → 產品下拉列出 `category IN ('cake_bar', 'tube_pkg')`，儲存時 `deduct_mode = 'ingredient'`。
- **包材耗損不在此 Dialog 支援**（參見非範圍說明）。
- 儲存 → `insert stock_adjustments` → 取得 `adjustment_id` → 批次 `insert stock_adjustment_items` → 呼叫共用 helper 寫 `inventory` / `packaging_material_inventory`。

### 試吃/耗損列表

訂單列表下方新增卡片：

```
┌ 今日試吃/耗損 ─────────────────────────┐
│ 🍰 試吃  蜂蜜蛋糕×2  (成品)  [✏️][🗑️] │
│ ⚠️ 耗損  cake_bar 經典×1  打翻  [✏️][🗑️] │
│ ...                                    │
└───────────────────────────────────────┘
```

**編輯**：重開 Dialog 預填資料，儲存時 delete 舊 items + inventory，重寫新 records。
**刪除**：`delete from stock_adjustments where id = ?` → `CASCADE` 會連帶刪 items；App 端按 `reference_note = 'adjust:${id}'` 批次刪 inventory / packaging_material_inventory。

---

## Section 6 — 扣減邏輯共用 helper

### 新檔：`src/lib/stock.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

interface DeductOptions {
  supabase: SupabaseClient
  productId: string
  quantity: number
  referenceNote: string  // 'order:${uuid}' | 'adjust:${uuid}'
  date: string           // YYYY-MM-DD
  packagingStyleId?: string | null
}

/**
 * 扣成品：透過 product_recipe 展開為原料扣減、透過 product_material_usage
 * 展開為包材扣減。
 */
export async function deductFinishedProduct(opts: DeductOptions): Promise<void> {
  const { supabase, productId, quantity, referenceNote, date, packagingStyleId } = opts

  const [recipeRes, materialRes] = await Promise.all([
    supabase
      .from('product_recipe')
      .select('ingredient_id, quantity_per_unit')
      .eq('product_id', productId),
    supabase
      .from('product_material_usage')
      .select('material_id, quantity_per_unit, packaging_style_id')
      .eq('product_id', productId),
  ])

  const inventoryRows = (recipeRes.data ?? []).map((r) => ({
    product_id: r.ingredient_id,
    type: 'outbound',
    quantity: -(r.quantity_per_unit * quantity),
    reference_note: referenceNote,
    date,
  }))

  const matchedMaterials = (materialRes.data ?? []).filter(
    (m) => m.packaging_style_id === packagingStyleId || m.packaging_style_id === null
  )
  const materialRows = matchedMaterials.map((m) => ({
    material_id: m.material_id,
    type: 'outbound',
    quantity: -(m.quantity_per_unit * quantity),
    reference_note: referenceNote,
    date,
  }))

  if (inventoryRows.length > 0) {
    await supabase.from('inventory').insert(inventoryRows)
  }
  if (materialRows.length > 0) {
    await supabase.from('packaging_material_inventory').insert(materialRows)
  }
}

/**
 * 扣原料：直接寫入 inventory（不經過 recipe）。限 cake_bar / tube_pkg。
 */
export async function deductIngredient(opts: Omit<DeductOptions, 'packagingStyleId'>): Promise<void> {
  const { supabase, productId, quantity, referenceNote, date } = opts
  await supabase.from('inventory').insert({
    product_id: productId,
    type: 'outbound',
    quantity: -quantity,
    reference_note: referenceNote,
    date,
  })
}
```

### 訂單扣減改造

`src/app/calendar/[date]/page.tsx` 內原本的 switch-by-category 硬編碼邏輯 → 改為呼叫 `deductFinishedProduct`：

```ts
// packagingStyleId 從訂單取對應 category 的包裝欄位（現有 orders schema）：
//   cake        → order.cake_packaging_id
//   tube        → order.tube_packaging_id
//   single_cake → item.packaging_id（per-item）
//   cookie      → null
function resolvePackagingStyleForItem(order, product, item) {
  if (product.category === 'cake')        return order.cake_packaging_id ?? null
  if (product.category === 'tube')        return order.tube_packaging_id ?? null
  if (product.category === 'single_cake') return item.packaging_id ?? null
  return null
}

for (const item of orderItems) {
  const product = products.find((p) => p.id === item.product_id)
  if (!product) continue
  if (product.category === 'cake_bar' || product.category === 'tube_pkg') continue

  await deductFinishedProduct({
    supabase,
    productId: item.product_id,
    quantity: item.quantity,
    referenceNote: `order:${orderId}`,
    date: order.order_date,
    packagingStyleId: resolvePackagingStyleForItem(order, product, item),
  })
}

// tube_pkg（per-packaging）保留現狀：按訂單 tube_packaging_id 對應
// 包裝款式名稱，扣同名 tube_pkg 產品 inventory
```

### 試吃/耗損扣減

```ts
for (const item of adjustmentItems) {
  if (item.deduct_mode === 'finished') {
    await deductFinishedProduct({
      supabase,
      productId: item.product_id,
      quantity: item.quantity,
      referenceNote: `adjust:${adjustmentId}`,
      date: adjustment.date,
      packagingStyleId: null,  // 試吃不綁包裝款式，用通用包材
    })
  } else {
    await deductIngredient({
      supabase,
      productId: item.product_id,
      quantity: item.quantity,
      referenceNote: `adjust:${adjustmentId}`,
      date: adjustment.date,
    })
  }
}
```

---

## Section 7 — 儀表板試吃統計圖表

影響檔案：`src/app/dashboard/page.tsx`

### 新增統計卡片：「本月試吃次數」

- 資料：`stock_adjustments` count where `adjustment_type = 'sample'` 且 `date` 落在本月
- 顯示：綠色卡片（與訂單相關卡片區分）

```ts
const { count } = await supabase
  .from('stock_adjustments')
  .select('*', { count: 'exact', head: true })
  .eq('adjustment_type', 'sample')
  .gte('date', monthStart)
  .lte('date', monthEnd)
```

### 新增圖表：「本月試吃品項分布」

- **類型**：BarChart（水平長條）
- **資料**：`stock_adjustment_items` JOIN `stock_adjustments` 篩 `adjustment_type = 'sample'` 且 `date` 本月，按 `product_id` 分組聚合 `SUM(quantity)`，展示產品名稱
- **顏色**：綠色系（區別於現有圖表色系）
- **空狀態**：若本月無試吃紀錄，顯示「本月尚無試吃紀錄」

```ts
const { data } = await supabase
  .from('stock_adjustment_items')
  .select(`
    product_id,
    quantity,
    deduct_mode,
    stock_adjustments!inner(date, adjustment_type)
  `)
  .eq('stock_adjustments.adjustment_type', 'sample')
  .gte('stock_adjustments.date', monthStart)
  .lte('stock_adjustments.date', monthEnd)

// 客戶端聚合 → resolve product name → 畫 BarChart
```

**儀表板總覽**：由 5 卡片 + 4 圖表 擴為 **6 卡片 + 5 圖表**。

---

## Section 8 — 取捨與未來延伸

### 本次不做

| 項目 | 原因 |
|------|------|
| `tube_pkg` 消耗資料化 | per-packaging 屬性複雜，需另擴 `packaging_styles` schema；目前硬編碼尚能運作 |
| 包材耗損 | 語意不同（包材報廢）、資料表也不同；`/materials` 頁面另開按鈕更合適 |
| 耗損統計圖表 | 需求只要求試吃統計 |
| 試吃/耗損 CSV 匯出 | 目前 `/calendar/[date]` 的 CSV 僅匯出訂單，維持聚焦 |
| 多層級 recipe | 目前配方都是直接指向原料（cake_bar/tube_pkg），未有成品 A → 成品 B 的鏈式需求 |
| 製程耗損係數（yield） | 未有明確需求 |

### 未來延伸

- `packaging_styles` 新增 `container_product_id` FK → `tube_pkg`，完全資料化包裝→容器對應
- `product_recipe` 加入 `yield_ratio` 欄位（例如麵糊 yield 95%）
- 耗損原因分類（破損 / 過期 / 客訴 / 其他）
- `/materials` 頁面的包材耗損介面

---

## Section 9 — 驗證清單

### Migration 驗證

- [ ] 010 執行後 `product_recipe` 有 15 筆紀錄（6+3+3+3）
- [ ] 任選 3 筆各類型訂單（cake 組合盒 / cake 單口味盒 / tube / single_cake），刪除後重建，比對 `inventory` 扣減數字與遷移前一致
- [ ] 011 執行後可手動 insert/delete `stock_adjustments` + `stock_adjustment_items`

### 功能驗證

- [ ] 在 `/settings` 新增「蜂蜜蛋糕試吃盒」：分類 `cake`、名稱「試吃盒」、原料 `經典×1 / 伯爵×0.5 / 茉莉×0.5`、包材（任選）
- [ ] 建立訂單 5 盒試吃盒 → `cake_bar` 經典扣 5、伯爵扣 2.5、茉莉扣 2.5；包材按 `product_material_usage` 扣
- [ ] 編輯該訂單數量為 3 盒 → inventory 回沖後重算（扣 3/1.5/1.5）
- [ ] 刪除訂單 → 相關 inventory 記錄（`reference_note = 'order:${id}'`）完全清除

### 試吃/耗損驗證

- [ ] `/calendar/[2026-04-17]` 新增「今日試吃」扣成品「試吃盒 × 2」 → `cake_bar` 經典扣 2、伯爵扣 1、茉莉扣 1
- [ ] 新增「今日耗損」扣原料「cake_bar 經典 × 1」 → `cake_bar` 經典扣 1
- [ ] 刪除 adjustment → inventory 記錄同步清除（按 `reference_note = 'adjust:${id}'`）

### 儀表板驗證

- [ ] 「本月試吃次數」卡片正確顯示 adjustments 筆數
- [ ] 「本月試吃品項分布」BarChart 正確顯示聚合結果
- [ ] 耗損不影響試吃卡片/圖表（`adjustment_type` 篩選正確）

### Realtime 驗證（若需啟用）

- [ ] `stock_adjustments` / `stock_adjustment_items` 加入 `supabase_realtime` publication（可選）
- [ ] 多人同時操作自動刷新列表

---

## 待人工執行清單

實作完成後，使用者需手動執行：

1. 到 Supabase Dashboard > SQL Editor 執行 `010_product_recipe.sql`
2. 驗證 `product_recipe` 有 15 筆
3. 到 SQL Editor 執行 `011_stock_adjustments.sql`
4. （可選）到 Database > Publications > `supabase_realtime`，加入 `stock_adjustments` 和 `stock_adjustment_items`
5. Vercel 自動部署後，開啟應用驗證「新增試吃盒」流程
