# Product Recipe BOM + 試吃/耗損 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將硬編碼的原料消耗規則遷移為資料驅動 BOM、擴充設定頁面可同時設定配方+包材、新增「今日試吃/耗損」非訂單庫存扣減功能、儀表板加入試吃統計圖表。

**Architecture:** 新建 `product_recipe` 表承接原料配方、新建 `stock_adjustments` + `stock_adjustment_items` 父子表承接試吃/耗損。抽出 `src/lib/stock.ts` 共用 helper，訂單扣減與試吃/耗損扣減共用同一組 calculate/apply/reverse 函式。既有 `product_material_usage` 不動。

**Tech Stack:** Next.js 16 App Router + TypeScript 5 + Supabase JS v2 + Tailwind 4 + shadcn/ui (@base-ui/react) + Recharts 3.8

**Spec**: `docs/superpowers/specs/2026-04-17-product-recipe-bom-design.md`

---

## File Structure

**Create**:
- `supabase/migrations/010_product_recipe.sql` — recipe 表 + seed 15 筆現有規則
- `supabase/migrations/011_stock_adjustments.sql` — adjustments 父子表
- `src/lib/stock.ts` — 扣減 helper（calculate/apply/reverse + direct ingredient）
- `src/components/stock-adjustment-dialog.tsx` — 試吃/耗損 Dialog 元件

**Modify**:
- `src/lib/types.ts` — 新增 ProductRecipe, StockAdjustment, StockAdjustmentItem, AdjustmentType, DeductMode
- `src/app/settings/page.tsx` — 新增產品 Dialog 擴充原料/包材區塊 + 編輯配方按鈕
- `src/app/calendar/[date]/page.tsx` — 原本硬編碼 `calculateDeductions` 改用 helper + 新增試吃/耗損按鈕與列表
- `src/app/dashboard/page.tsx` — 新增「本月試吃次數」卡片 + 「本月試吃品項分布」BarChart
- `LAD.md` — 更新 migrations 清單、schema、功能清單、待執行 SQL

**Working directory**：所有 bash 指令假設 `cd "/c/Users/sf862/OneDrive/桌面/packaging-calendar"`

**Commit policy**：每個 task 結尾 commit + push（依據 packaging-calendar 的 auto-push memory）。

**Verification policy**：本專案無自動化測試框架。每個 task 用以下方式驗證：
- SQL migrations：使用者到 Supabase Dashboard > SQL Editor 手動執行 + `SELECT count(*)` 檢查
- TypeScript 變更：`npx tsc --noEmit` 確認型別無誤
- UI 變更：`npm run dev` 啟動、瀏覽器手動操作
- Full build：`npm run build` 在關鍵節點跑一次

---

## Phase 1: Database Foundation

### Task 1: Migration 010 — product_recipe 表 + seed 15 筆

**Files**:
- Create: `supabase/migrations/010_product_recipe.sql`

- [ ] **Step 1: 建立 migration 檔案**

建立 `supabase/migrations/010_product_recipe.sql`，內容：

```sql
-- === Migration 010: product_recipe (原料配方) ===

CREATE TABLE product_recipe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_per_unit NUMERIC NOT NULL CHECK (quantity_per_unit > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, ingredient_id)
);
CREATE INDEX idx_product_recipe_product ON product_recipe(product_id);

ALTER TABLE product_recipe ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select product_recipe"
  ON product_recipe FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert product_recipe"
  ON product_recipe FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update product_recipe"
  ON product_recipe FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete product_recipe"
  ON product_recipe FOR DELETE TO authenticated USING (true);

-- Seed cake (6 產品)
-- 組合盒「A+B」→ A × 1 + B × 1
-- 單口味盒「A」→ A × 2
INSERT INTO product_recipe (product_id, ingredient_id, quantity_per_unit)
SELECT c.id, cb.id, CASE
  WHEN c.name = cb.name THEN 2
  WHEN c.name LIKE cb.name || '+%' THEN 1
  WHEN c.name LIKE '%+' || cb.name THEN 1
END
FROM products c
JOIN products cb ON cb.category = 'cake_bar' AND cb.is_active = true
WHERE c.category = 'cake' AND c.is_active = true
  AND (c.name = cb.name OR c.name LIKE cb.name || '+%' OR c.name LIKE '%+' || cb.name);

-- Seed tube (3 產品)
INSERT INTO product_recipe (product_id, ingredient_id, quantity_per_unit)
SELECT t.id, cb.id, 1
FROM products t
JOIN products cb ON cb.category = 'cake_bar' AND cb.is_active = true
WHERE t.category = 'tube' AND t.is_active = true
  AND REPLACE(t.name, '旋轉筒-', '') = cb.name;

-- Seed single_cake (3 產品)
INSERT INTO product_recipe (product_id, ingredient_id, quantity_per_unit)
SELECT s.id, cb.id, 0.25
FROM products s
JOIN products cb ON cb.category = 'cake_bar' AND cb.is_active = true
WHERE s.category = 'single_cake' AND s.is_active = true
  AND REPLACE(s.name, '單入-', '') = cb.name;
```

- [ ] **Step 2: 使用者到 Supabase Dashboard 執行 SQL**

告知使用者：到 https://zgkvmbaxbksxjckzkths.supabase.co > SQL Editor，貼上 `010_product_recipe.sql` 的全部內容並執行。

- [ ] **Step 3: 驗證 seed 結果**

使用者在 SQL Editor 執行：

```sql
-- 應回傳 15（6 cake + 3 tube + 3 single_cake）
SELECT COUNT(*) FROM product_recipe;

-- 詳細檢查（應看到所有 18 個成品產品中 15 個有 recipe）
SELECT p.category, p.name, cb.name AS ingredient, pr.quantity_per_unit
FROM product_recipe pr
JOIN products p ON p.id = pr.product_id
JOIN products cb ON cb.id = pr.ingredient_id
ORDER BY p.category, p.name, cb.name;
```

預期 15 筆。若數字不符，檢查產品名稱是否符合 `LIKE` 模式（例如 `經典原味+伯爵紅茶`、`旋轉筒-經典原味`、`單入-經典原味`）。

- [ ] **Step 4: Commit + Push**

```bash
cd "/c/Users/sf862/OneDrive/桌面/packaging-calendar"
git add supabase/migrations/010_product_recipe.sql
git commit -m "feat(db): 新增 product_recipe migration 並 seed 既有產品配方"
git push
```

---

### Task 2: Migration 011 — stock_adjustments + stock_adjustment_items

**Files**:
- Create: `supabase/migrations/011_stock_adjustments.sql`

- [ ] **Step 1: 建立 migration 檔案**

建立 `supabase/migrations/011_stock_adjustments.sql`，內容：

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

ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select stock_adjustments"
  ON stock_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert stock_adjustments"
  ON stock_adjustments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update stock_adjustments"
  ON stock_adjustments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete stock_adjustments"
  ON stock_adjustments FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can select stock_adjustment_items"
  ON stock_adjustment_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert stock_adjustment_items"
  ON stock_adjustment_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update stock_adjustment_items"
  ON stock_adjustment_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete stock_adjustment_items"
  ON stock_adjustment_items FOR DELETE TO authenticated USING (true);
```

- [ ] **Step 2: 使用者到 Supabase Dashboard 執行 SQL**

告知使用者：到 SQL Editor 貼上並執行 `011_stock_adjustments.sql`。

- [ ] **Step 3: 驗證**

使用者執行：

```sql
-- 驗證表存在且為空
SELECT COUNT(*) FROM stock_adjustments;  -- 0
SELECT COUNT(*) FROM stock_adjustment_items;  -- 0

-- 驗證 constraint 生效
INSERT INTO stock_adjustments (date, adjustment_type, note)
VALUES ('2026-04-17', 'invalid_type', 'test');  -- 應錯誤：違反 CHECK
```

預期第三條 INSERT 報錯 `violates check constraint`，證明 constraint 有效。

- [ ] **Step 4: Commit + Push**

```bash
git add supabase/migrations/011_stock_adjustments.sql
git commit -m "feat(db): 新增 stock_adjustments 父子表 migration"
git push
```

---

## Phase 2: Types + Helpers

### Task 3: TypeScript 型別擴充

**Files**:
- Modify: `src/lib/types.ts`

- [ ] **Step 1: 新增型別定義**

編輯 `src/lib/types.ts`，在檔案底部（現有 `DaySummary` 之後）追加：

```typescript
export type AdjustmentType = 'sample' | 'waste'
export type DeductMode = 'finished' | 'ingredient'

export interface ProductRecipe {
  id: string
  product_id: string
  ingredient_id: string
  quantity_per_unit: number
  created_at: string
  ingredient?: Product
}

export interface StockAdjustment {
  id: string
  date: string
  adjustment_type: AdjustmentType
  note: string | null
  created_at: string
  items?: StockAdjustmentItem[]
}

export interface StockAdjustmentItem {
  id: string
  adjustment_id: string
  product_id: string
  quantity: number
  deduct_mode: DeductMode
  product?: Product
}
```

- [ ] **Step 2: 驗證型別編譯**

```bash
cd "/c/Users/sf862/OneDrive/桌面/packaging-calendar"
npx tsc --noEmit
```

預期：無錯誤（或僅既有無關錯誤；若看到與新型別有關的錯誤才算失敗）。

- [ ] **Step 3: Commit + Push**

```bash
git add src/lib/types.ts
git commit -m "feat(types): 新增 ProductRecipe / StockAdjustment 型別"
git push
```

---

### Task 4: 扣減 helper `src/lib/stock.ts`

**Files**:
- Create: `src/lib/stock.ts`

- [ ] **Step 1: 建立 helper 檔案**

建立 `src/lib/stock.ts`，內容：

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Product, ProductMaterialUsage, ProductRecipe } from './types'

// ─── Types ─────────────────────────────────────────────────────
// productId → aggregated qty (positive number; actual inventory row uses negative)
export type IngredientDeductions = Record<string, number>
// materialId → aggregated qty
export type MaterialDeductions = Record<string, number>

export interface MissingMaterialCombo {
  productName: string
  packagingName: string | null
}

// ─── Calculate ─────────────────────────────────────────────────

/**
 * 依 recipe 對照計算原料扣減量。
 * itemEntries: [productId, qty] 清單。
 * recipes: 該批次相關產品的 product_recipe 紀錄（先篩過 product_id IN entries）。
 */
export function calculateIngredientDeductions(
  itemEntries: [string, number][],
  recipes: ProductRecipe[],
): IngredientDeductions {
  const deductions: IngredientDeductions = {}
  for (const [productId, qty] of itemEntries) {
    if (qty <= 0) continue
    const productRecipes = recipes.filter((r) => r.product_id === productId)
    for (const r of productRecipes) {
      deductions[r.ingredient_id] =
        (deductions[r.ingredient_id] || 0) + qty * r.quantity_per_unit
    }
  }
  return deductions
}

/**
 * 依 product_material_usage 計算包材扣減量。
 * packagingResolver 回傳該 product 對應的 packaging_style_id；
 * usage 會同時匹配 specific (packaging_style_id=X) 和 universal (null)。
 */
export function calculateMaterialDeductions(
  itemEntries: [string, number][],
  products: Product[],
  materialUsages: ProductMaterialUsage[],
  packagingResolver: (productId: string) => string | null,
  packagingStyleNameById: (id: string) => string | null,
): { deductions: MaterialDeductions; missingCombos: MissingMaterialCombo[] } {
  const deductions: MaterialDeductions = {}
  const missingCombos: MissingMaterialCombo[] = []

  for (const [productId, qty] of itemEntries) {
    if (qty <= 0) continue
    const product = products.find((p) => p.id === productId)
    if (!product) continue
    if (product.category === 'cake_bar' || product.category === 'tube_pkg') continue

    const pkgStyleId = packagingResolver(productId)
    const matched = materialUsages.filter(
      (u) =>
        u.product_id === productId &&
        (u.packaging_style_id === (pkgStyleId || null) || u.packaging_style_id === null),
    )

    if (matched.length === 0) {
      missingCombos.push({
        productName: product.name,
        packagingName: pkgStyleId ? packagingStyleNameById(pkgStyleId) : null,
      })
    }

    for (const usage of matched) {
      deductions[usage.material_id] =
        (deductions[usage.material_id] || 0) + qty * usage.quantity_per_unit
    }
  }

  return { deductions, missingCombos }
}

// ─── Apply / Reverse ──────────────────────────────────────────

/**
 * 寫入 inventory outbound 紀錄。referenceNote 用於回沖。
 */
export async function applyIngredientDeductions(
  supabase: SupabaseClient,
  deductions: IngredientDeductions,
  referenceNote: string,
  date: string,
): Promise<void> {
  const rows = Object.entries(deductions)
    .filter(([, qty]) => qty > 0)
    .map(([productId, qty]) => ({
      product_id: productId,
      date,
      type: 'outbound' as const,
      quantity: -(Math.round(qty * 100) / 100),
      reference_note: referenceNote,
    }))
  if (rows.length > 0) {
    await supabase.from('inventory').insert(rows)
  }
}

export async function applyMaterialDeductions(
  supabase: SupabaseClient,
  deductions: MaterialDeductions,
  referenceNote: string,
  date: string,
): Promise<void> {
  const rows = Object.entries(deductions)
    .filter(([, qty]) => qty > 0)
    .map(([materialId, qty]) => ({
      material_id: materialId,
      date,
      type: 'outbound' as const,
      quantity: -(Math.round(qty * 100) / 100),
      reference_note: referenceNote,
    }))
  if (rows.length > 0) {
    await supabase.from('packaging_material_inventory').insert(rows)
  }
}

export async function reverseIngredientDeductions(
  supabase: SupabaseClient,
  referenceNote: string,
): Promise<void> {
  await supabase.from('inventory').delete().eq('reference_note', referenceNote)
}

export async function reverseMaterialDeductions(
  supabase: SupabaseClient,
  referenceNote: string,
): Promise<void> {
  await supabase
    .from('packaging_material_inventory')
    .delete()
    .eq('reference_note', referenceNote)
}

// ─── Direct ingredient deduction (for stock adjustments 'ingredient' mode) ───

/**
 * 直接扣某原料庫存（不走 recipe 展開）。用於試吃/耗損的「扣原料」模式。
 */
export async function deductDirectIngredient(
  supabase: SupabaseClient,
  productId: string,
  quantity: number,
  referenceNote: string,
  date: string,
): Promise<void> {
  await supabase.from('inventory').insert({
    product_id: productId,
    date,
    type: 'outbound',
    quantity: -(Math.round(quantity * 100) / 100),
    reference_note: referenceNote,
  })
}
```

- [ ] **Step 2: 驗證編譯**

```bash
npx tsc --noEmit
```

預期：無錯誤。

- [ ] **Step 3: Commit + Push**

```bash
git add src/lib/stock.ts
git commit -m "feat(stock): 新增扣減共用 helper（calculate/apply/reverse + direct ingredient）"
git push
```

---

## Phase 3: Order Deduction Refactor

### Task 5: 訂單扣減改用 helper（移除硬編碼）

**Files**:
- Modify: `src/app/calendar/[date]/page.tsx`

**Context**: 現有 `calculateDeductions`（第 219-270 行）、`applyDeductions`、`reverseDeductions`、`calculateMaterialDeductions`、`applyMaterialDeductions`、`reverseMaterialDeductions` 函式要移除或改用 helper。`extractFlavors`（第 27-28 行）及其使用處也要清掉。

- [ ] **Step 1: 補齊 recipe 的 fetch**

編輯 `src/app/calendar/[date]/page.tsx`，找到 static data fetch 區域（通常有 `fetchProducts` / `fetchPackagingStyles` / `fetchMaterialUsages` 等），新增 `fetchRecipes`：

在 state 區域新增：

```typescript
const [recipes, setRecipes] = useState<ProductRecipe[]>([])
```

在 static data fetch 區域新增（與 materialUsages 並列）：

```typescript
const fetchRecipes = useCallback(async () => {
  const { data } = await supabase
    .from('product_recipe')
    .select('id, product_id, ingredient_id, quantity_per_unit, created_at')
  if (data) setRecipes(data as ProductRecipe[])
}, [])
```

並在 mount useEffect 中呼叫 `fetchRecipes()`。

確認檔案頂部 import：

```typescript
import type { ProductRecipe } from '@/lib/types'
import {
  calculateIngredientDeductions,
  calculateMaterialDeductions as calcMaterialDeductions,
  applyIngredientDeductions,
  applyMaterialDeductions,
  reverseIngredientDeductions,
  reverseMaterialDeductions,
} from '@/lib/stock'
```

- [ ] **Step 2: 移除 `extractFlavors` 函式**

在檔案頂部約第 27-28 行移除：

```typescript
// 刪除此函式（整個 function 體）：
// function extractFlavors(name: string, category: string): string[] { ... }
```

其他呼叫 `extractFlavors` 的位置會在下一步被取代。

- [ ] **Step 3: 重寫 `calculateDeductions`**

找到現有 `calculateDeductions` 函式（約 219-270 行），整個替換為：

```typescript
const calculateDeductions = (itemEntries: [string, number][], tubePackagingId?: string) => {
  // 原料扣減：透過 product_recipe 展開
  const deductions: Record<string, number> = calculateIngredientDeductions(itemEntries, recipes)

  // tube_pkg 扣減：保留現狀（按訂單 tube_packaging_id 對應包裝款式名稱，扣同名 tube_pkg 產品）
  // 這是 per-packaging 屬性，不在 recipe 內
  let totalTubes = 0
  for (const [productId, qty] of itemEntries) {
    if (qty <= 0) continue
    const product = products.find((p: any) => p.id === productId)
    if (product?.category === 'tube') totalTubes += qty
  }

  if (tubePackagingId && totalTubes > 0) {
    const pkgStyleName = packagingStyles.find((ps) => ps.id === tubePackagingId)?.name
    if (pkgStyleName) {
      const tubePkgProducts = products.filter((p: any) => p.category === 'tube_pkg')
      const tubePkg = tubePkgProducts.find((p: any) => p.name === pkgStyleName)
      if (tubePkg) {
        deductions[tubePkg.id] = (deductions[tubePkg.id] || 0) + totalTubes
      }
    }
  }

  return deductions
}
```

- [ ] **Step 4: 改寫 `applyDeductions` 和 `reverseDeductions` 為 helper wrapper**

找到 `applyDeductions`（約 272-285 行）和 `reverseDeductions`（約 287-289 行），替換為：

```typescript
const applyDeductions = async (orderId: string, deductions: Record<string, number>, orderDate: string) => {
  await applyIngredientDeductions(supabase, deductions, `order:${orderId}`, orderDate)
}

const reverseDeductions = async (orderId: string) => {
  await reverseIngredientDeductions(supabase, `order:${orderId}`)
}
```

- [ ] **Step 5: 改寫 `calculateMaterialDeductions` 為 helper wrapper**

找到現有 `calculateMaterialDeductions`（約 293-333 行），整個替換為：

```typescript
const calculateMaterialDeductionsLocal = (
  itemEntries: [string, number][],
  orderCakePackagingId?: string,
  orderTubePackagingId?: string,
  singleCakePackagingMap?: Record<string, string>,
) => {
  return calcMaterialDeductions(
    itemEntries,
    products,
    materialUsages,
    (productId) => {
      const product = products.find((p) => p.id === productId)
      if (!product) return null
      if (product.category === 'cake') return orderCakePackagingId ?? null
      if (product.category === 'tube') return orderTubePackagingId ?? null
      if (product.category === 'single_cake') return singleCakePackagingMap?.[productId] ?? null
      return null
    },
    (id) => packagingStyles.find((ps) => ps.id === id)?.name ?? null,
  )
}
```

並把**所有**原本呼叫 `calculateMaterialDeductions(...)` 的地方改為 `calculateMaterialDeductionsLocal(...)`（搜尋函式名稱全部替換，這樣避免與 imported `calcMaterialDeductions` 命名衝突）。

- [ ] **Step 6: 改寫 `applyMaterialDeductions` 和 `reverseMaterialDeductions`**

找到 `applyMaterialDeductions`（約 335-348 行）和 `reverseMaterialDeductions`（約 350-352 行），替換為：

```typescript
const applyMaterialDeductionsLocal = async (orderId: string, deductions: Record<string, number>, orderDate: string) => {
  await applyMaterialDeductions(supabase, deductions, `order:${orderId}`, orderDate)
}

const reverseMaterialDeductionsLocal = async (orderId: string) => {
  await reverseMaterialDeductions(supabase, `order:${orderId}`)
}
```

並把所有原本呼叫 `applyMaterialDeductions(...)` 和 `reverseMaterialDeductions(...)` 改為 `applyMaterialDeductionsLocal(...)` / `reverseMaterialDeductionsLocal(...)`。

- [ ] **Step 7: 驗證編譯**

```bash
npx tsc --noEmit
```

預期：無錯誤。

若出現 `Cannot find name 'extractFlavors'` → 搜尋所有引用並刪除：

```bash
grep -rn "extractFlavors" "/c/Users/sf862/OneDrive/桌面/packaging-calendar/src/"
```

若有殘留引用（例如仍有使用 `extractFlavors(product.name, product.category)`），該處邏輯已被 recipe-based 扣減取代，整段可移除。

- [ ] **Step 8: 建構驗證**

```bash
npm run build
```

預期：無編譯錯誤，build 成功。

- [ ] **Step 9: Regression 手動測試**

啟動 dev server：

```bash
npm run dev
```

使用者開啟 http://localhost:3000/calendar/2026-04-17，完成以下檢查清單：

1. **既有訂單顯示正常**（不崩潰、扣減記錄仍在）
2. **新建 cake 組合盒訂單**：客戶「測試1」、1 盒「經典原味+伯爵紅茶」、選包裝「祝福緞帶(米)」
   - 存檔後到 `/inventory` 檢查：經典原味 cake_bar 扣 1 條、伯爵紅茶 cake_bar 扣 1 條
3. **新建 cake 單口味盒訂單**：客戶「測試2」、1 盒「經典原味」、選包裝
   - 檢查：經典原味 cake_bar 扣 2 條
4. **新建 tube 訂單**：客戶「測試3」、1 筒「旋轉筒-伯爵紅茶」、選包裝「四季童話」
   - 檢查：伯爵紅茶 cake_bar 扣 1 條、四季童話 tube_pkg 扣 1 個
5. **新建 single_cake 訂單**：客戶「測試4」、4 個「單入-茉莉花茶」、選包裝「花園」
   - 檢查：茉莉花茶 cake_bar 扣 1 條（0.25 × 4）
6. **刪除所有測試訂單**：檢查 `/inventory` 所有扣減記錄回沖到初始值

若有任何扣減數字與改造前不同，停下來 debug：
- 檢查 `recipes` state 是否正確載入（console.log 確認有 15 筆）
- 檢查 `calculateIngredientDeductions` 傳入的 `itemEntries` 格式
- 確認 `product_recipe` seed 有該產品的紀錄

- [ ] **Step 10: Commit + Push**

```bash
git add src/app/calendar/[date]/page.tsx
git commit -m "refactor: 訂單扣減改為 data-driven（product_recipe）移除硬編碼"
git push
```

---

## Phase 4: Settings Page — 擴充新增產品 + 配方編輯

### Task 6: 設定頁面 — State 與 handler 擴充

**Files**:
- Modify: `src/app/settings/page.tsx`

**Context**: 新增產品 Dialog 要新增兩個區塊（原料消耗 / 包材消耗），Task 6 先加資料層（state、handlers、fetches），Task 7 再加 UI。

- [ ] **Step 1: 新增 fetch materials、recipes、usages**

找到 `src/app/settings/page.tsx` 的 fetch 區域（約 210-238 行），新增：

```typescript
// 於 state 區域增加
const [materials, setMaterials] = useState<PackagingMaterial[]>([])
const [recipes, setRecipes] = useState<ProductRecipe[]>([])
const [materialUsages, setMaterialUsages] = useState<ProductMaterialUsage[]>([])
```

import 區加：

```typescript
import type { PackagingMaterial, ProductRecipe, ProductMaterialUsage } from '@/lib/types'
```

在 fetch callback 區（`fetchProducts` 之後）新增：

```typescript
const fetchMaterials = useCallback(async () => {
  const { data } = await supabase
    .from('packaging_materials')
    .select('*')
    .eq('is_active', true)
    .order('name')
  if (data) setMaterials(data as PackagingMaterial[])
}, [supabase])

const fetchRecipes = useCallback(async () => {
  const { data } = await supabase
    .from('product_recipe')
    .select('id, product_id, ingredient_id, quantity_per_unit, created_at')
  if (data) setRecipes(data as ProductRecipe[])
}, [supabase])

const fetchMaterialUsages = useCallback(async () => {
  const { data } = await supabase
    .from('product_material_usage')
    .select('*')
  if (data) setMaterialUsages(data as ProductMaterialUsage[])
}, [supabase])
```

並在 mount useEffect 中呼叫（更新既有 useEffect）：

```typescript
useEffect(() => {
  fetchProducts()
  fetchPackagingStyles()
  fetchBrandingStyles()
  fetchMaterials()
  fetchRecipes()
  fetchMaterialUsages()
}, [fetchProducts, fetchPackagingStyles, fetchBrandingStyles, fetchMaterials, fetchRecipes, fetchMaterialUsages])
```

- [ ] **Step 2: 新增 Dialog 的 recipe/material row state**

在 `newProductName` 等現有 state 附近新增：

```typescript
interface RecipeRow {
  ingredientId: string
  qty: string
}
interface MaterialRow {
  materialId: string
  qty: string
  packagingStyleId: string  // '' = 全部適用
}

const [newProductRecipes, setNewProductRecipes] = useState<RecipeRow[]>([])
const [newProductMaterials, setNewProductMaterials] = useState<MaterialRow[]>([])

// 編輯用：追蹤目前正在編輯的 productId（null = 新增模式）
const [editingProductId, setEditingProductId] = useState<string | null>(null)
```

- [ ] **Step 3: 新增 row 管理 handler**

在 handler 區新增：

```typescript
const addRecipeRow = () =>
  setNewProductRecipes((prev) => [...prev, { ingredientId: '', qty: '1' }])

const removeRecipeRow = (index: number) =>
  setNewProductRecipes((prev) => prev.filter((_, i) => i !== index))

const updateRecipeRow = (index: number, field: keyof RecipeRow, value: string) =>
  setNewProductRecipes((prev) =>
    prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
  )

const addMaterialRow = () =>
  setNewProductMaterials((prev) => [
    ...prev,
    { materialId: '', qty: '1', packagingStyleId: '' },
  ])

const removeMaterialRow = (index: number) =>
  setNewProductMaterials((prev) => prev.filter((_, i) => i !== index))

const updateMaterialRow = (index: number, field: keyof MaterialRow, value: string) =>
  setNewProductMaterials((prev) =>
    prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
  )

const resetProductForm = () => {
  setNewProductCategory('')
  setNewProductName('')
  setNewProductRecipes([])
  setNewProductMaterials([])
  setEditingProductId(null)
}
```

- [ ] **Step 4: 驗證編譯**

```bash
npx tsc --noEmit
```

預期：無錯誤（Dialog 尚未使用新 state，所以不會有 UI 警告）。

- [ ] **Step 5: Commit + Push**

```bash
git add src/app/settings/page.tsx
git commit -m "feat(settings): 新增 recipe/material rows state 與 handler"
git push
```

---

### Task 7: 設定頁面 — 新增產品 Dialog UI

**Files**:
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: 擴充新增產品 Dialog 內容**

找到既有「新增產品 Dialog」（約 442-482 行），將 `DialogContent` 內容整個替換為：

```tsx
<DialogContent className="max-w-xl">
  <DialogHeader>
    <DialogTitle>{editingProductId ? '編輯產品配方' : '新增產品'}</DialogTitle>
    <DialogDescription>
      {editingProductId
        ? '編輯產品的原料與包材消耗配方'
        : '選擇分類、輸入產品名稱，並設定原料與包材消耗'}
    </DialogDescription>
  </DialogHeader>
  <div className="space-y-4">
    {/* 基本資訊 */}
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>分類</Label>
        <select
          value={newProductCategory}
          onChange={(e) => setNewProductCategory(e.target.value)}
          disabled={!!editingProductId}
          className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          <option value="" disabled>選擇分類</option>
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {CATEGORY_ICONS[opt.value]} {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>名稱</Label>
        <Input
          value={newProductName}
          onChange={(e) => setNewProductName(e.target.value)}
          placeholder="輸入產品名稱"
        />
      </div>
    </div>

    {/* 原料 / 包材（僅非 cake_bar/tube_pkg 顯示） */}
    {newProductCategory && newProductCategory !== 'cake_bar' && newProductCategory !== 'tube_pkg' && (
      <>
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-500">原料消耗（可選）</Label>
            <Button type="button" variant="ghost" size="xs" onClick={addRecipeRow}>
              <PlusIcon className="size-3" /> 新增原料
            </Button>
          </div>
          {newProductRecipes.length === 0 && (
            <p className="text-xs text-gray-400">尚無原料消耗</p>
          )}
          {newProductRecipes.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={row.ingredientId}
                onChange={(e) => updateRecipeRow(i, 'ingredientId', e.target.value)}
                className="flex h-8 flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
              >
                <option value="" disabled>選擇原料</option>
                {products
                  .filter((p) => (p.category === 'cake_bar' || p.category === 'tube_pkg') && p.is_active)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={row.qty}
                onChange={(e) => updateRecipeRow(i, 'qty', e.target.value)}
                className="h-8 w-20"
                placeholder="數量"
              />
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeRecipeRow(i)}>
                <XIcon className="size-3" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-500">包材消耗（可選）</Label>
            <Button type="button" variant="ghost" size="xs" onClick={addMaterialRow}>
              <PlusIcon className="size-3" /> 新增包材
            </Button>
          </div>
          {newProductMaterials.length === 0 && (
            <p className="text-xs text-gray-400">尚無包材消耗</p>
          )}
          {newProductMaterials.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={row.materialId}
                onChange={(e) => updateMaterialRow(i, 'materialId', e.target.value)}
                className="flex h-8 flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
              >
                <option value="" disabled>選擇包材</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={row.qty}
                onChange={(e) => updateMaterialRow(i, 'qty', e.target.value)}
                className="h-8 w-20"
                placeholder="數量"
              />
              <select
                value={row.packagingStyleId}
                onChange={(e) => updateMaterialRow(i, 'packagingStyleId', e.target.value)}
                className="flex h-8 w-28 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
              >
                <option value="">套用全部</option>
                {packagingStyles
                  .filter((ps) => ps.category === newProductCategory && ps.is_active)
                  .map((ps) => (
                    <option key={ps.id} value={ps.id}>{ps.name}</option>
                  ))}
              </select>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeMaterialRow(i)}>
                <XIcon className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      </>
    )}
  </div>
  <DialogFooter>
    <Button variant="outline" onClick={() => { resetProductForm(); setProductDialogOpen(false) }}>取消</Button>
    <Button onClick={addProduct}>{editingProductId ? '儲存' : '新增'}</Button>
  </DialogFooter>
</DialogContent>
```

- [ ] **Step 2: 確認 Dialog open 切換重置**

找到既有「設定 Dialog 的 onOpenChange」約 442 行，改為：

```tsx
<Dialog
  open={productDialogOpen}
  onOpenChange={(open) => {
    setProductDialogOpen(open)
    if (!open) resetProductForm()
  }}
>
```

- [ ] **Step 3: 驗證編譯**

```bash
npx tsc --noEmit
```

預期：無錯誤。

- [ ] **Step 4: 視覺驗證**

```bash
npm run dev
```

使用者開啟 `/settings`，點「新增產品」，確認：
1. 選擇「蜂蜜蛋糕(盒)」 → 顯示原料+包材兩個區塊
2. 選擇「蛋糕原料(條)」 → 兩個區塊隱藏
3. 「新增原料」可增加一行，原料下拉只看到 cake_bar + tube_pkg 產品
4. 「新增包材」可增加一行，包材下拉只看到 active 包材，包裝下拉含「套用全部」+ 該分類的包裝款式
5. 點「取消」→ 所有 row 與欄位清空

- [ ] **Step 5: Commit + Push**

```bash
git add src/app/settings/page.tsx
git commit -m "feat(settings): 新增產品 Dialog 加入原料與包材消耗區塊"
git push
```

---

### Task 8: 設定頁面 — 三段儲存邏輯（含 rollback）

**Files**:
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: 改寫 `addProduct`（新增模式）**

找到既有 `addProduct` 函式（約 242-258 行），整個替換為：

```typescript
const addProduct = async () => {
  const trimmed = newProductName.trim()
  if (!trimmed || !newProductCategory) return

  // 編輯模式走另一個 handler
  if (editingProductId) {
    await saveProductEdit()
    return
  }

  // ─── 新增模式：三段寫入 ───

  // 1. Insert products
  const { data: productRow, error: prodErr } = await supabase
    .from('products')
    .insert({ category: newProductCategory, name: trimmed, sort_order: 99 })
    .select()
    .single()

  if (prodErr || !productRow) {
    alert(`新增產品失敗：${prodErr?.message ?? 'unknown'}`)
    return
  }
  const newProductId = productRow.id

  // 2. Insert product_recipe（若有）
  const recipeRows = newProductRecipes
    .filter((r) => r.ingredientId && parseFloat(r.qty) > 0)
    .map((r) => ({
      product_id: newProductId,
      ingredient_id: r.ingredientId,
      quantity_per_unit: parseFloat(r.qty),
    }))

  if (recipeRows.length > 0) {
    const { error: recipeErr } = await supabase.from('product_recipe').insert(recipeRows)
    if (recipeErr) {
      // Rollback: 刪除剛建的 product
      await supabase.from('products').delete().eq('id', newProductId)
      alert(`新增原料配方失敗，已還原：${recipeErr.message}`)
      return
    }
  }

  // 3. Insert product_material_usage（若有）
  const materialRows = newProductMaterials
    .filter((m) => m.materialId && parseFloat(m.qty) > 0)
    .map((m) => ({
      product_id: newProductId,
      material_id: m.materialId,
      packaging_style_id: m.packagingStyleId || null,
      quantity_per_unit: parseFloat(m.qty),
    }))

  if (materialRows.length > 0) {
    const { error: matErr } = await supabase.from('product_material_usage').insert(materialRows)
    if (matErr) {
      // Rollback: 刪除 recipe + product
      await supabase.from('product_recipe').delete().eq('product_id', newProductId)
      await supabase.from('products').delete().eq('id', newProductId)
      alert(`新增包材對照失敗，已還原：${matErr.message}`)
      return
    }
  }

  resetProductForm()
  setProductDialogOpen(false)
  fetchProducts()
  fetchRecipes()
  fetchMaterialUsages()
}
```

- [ ] **Step 2: 新增 `saveProductEdit`（編輯模式）**

在 `addProduct` 之前新增：

```typescript
const saveProductEdit = async () => {
  if (!editingProductId) return
  const trimmed = newProductName.trim()
  if (!trimmed) return

  // 1. Update products.name
  const { error: nameErr } = await supabase
    .from('products')
    .update({ name: trimmed })
    .eq('id', editingProductId)
  if (nameErr) {
    alert(`更新名稱失敗：${nameErr.message}`)
    return
  }

  // 2. Replace product_recipe（delete + insert）
  await supabase.from('product_recipe').delete().eq('product_id', editingProductId)
  const recipeRows = newProductRecipes
    .filter((r) => r.ingredientId && parseFloat(r.qty) > 0)
    .map((r) => ({
      product_id: editingProductId,
      ingredient_id: r.ingredientId,
      quantity_per_unit: parseFloat(r.qty),
    }))
  if (recipeRows.length > 0) {
    const { error } = await supabase.from('product_recipe').insert(recipeRows)
    if (error) {
      alert(`更新原料配方失敗：${error.message}`)
      return
    }
  }

  // 3. Replace product_material_usage（delete + insert）
  await supabase.from('product_material_usage').delete().eq('product_id', editingProductId)
  const materialRows = newProductMaterials
    .filter((m) => m.materialId && parseFloat(m.qty) > 0)
    .map((m) => ({
      product_id: editingProductId,
      material_id: m.materialId,
      packaging_style_id: m.packagingStyleId || null,
      quantity_per_unit: parseFloat(m.qty),
    }))
  if (materialRows.length > 0) {
    const { error } = await supabase.from('product_material_usage').insert(materialRows)
    if (error) {
      alert(`更新包材對照失敗：${error.message}`)
      return
    }
  }

  resetProductForm()
  setProductDialogOpen(false)
  fetchProducts()
  fetchRecipes()
  fetchMaterialUsages()
}
```

- [ ] **Step 3: 驗證編譯**

```bash
npx tsc --noEmit
```

預期：無錯誤。

- [ ] **Step 4: 功能測試**

使用者跑：

```bash
npm run dev
```

開啟 `/settings`，實測「蜂蜜蛋糕試吃盒」新增流程：

1. 點「新增產品」
2. 分類：`蜂蜜蛋糕（盒）`
3. 名稱：`試吃盒`
4. 新增 3 行原料：
   - 經典原味 × 1
   - 伯爵紅茶 × 0.5
   - 茉莉花茶 × 0.5
5. 新增 1 行包材（任選一個現有包材，例如用「祝福緞帶(米)」包裝下的盒子，數量 1）
6. 點「新增」

驗證：
- 產品管理清單出現「試吃盒」（分類：蜂蜜蛋糕（盒））
- 到 Supabase SQL Editor：
  ```sql
  SELECT p.name AS product, cb.name AS ingredient, pr.quantity_per_unit
  FROM product_recipe pr
  JOIN products p ON p.id = pr.product_id
  JOIN products cb ON cb.id = pr.ingredient_id
  WHERE p.name = '試吃盒';
  ```
  預期 3 筆（經典 1、伯爵 0.5、茉莉 0.5）

- 對「試吃盒」下一筆訂單 3 盒 → `cake_bar` 經典扣 3 條、伯爵扣 1.5 條、茉莉扣 1.5 條

- [ ] **Step 5: Commit + Push**

```bash
git add src/app/settings/page.tsx
git commit -m "feat(settings): 新增產品儲存實作三段寫入與 rollback"
git push
```

---

### Task 9: 設定頁面 — 編輯既有產品配方按鈕

**Files**:
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: 新增 `openEditProduct` 函式**

在 handler 區（`resetProductForm` 附近）新增：

```typescript
const openEditProduct = (product: Product) => {
  setEditingProductId(product.id)
  setNewProductCategory(product.category)
  setNewProductName(product.name)

  const productRecipes = recipes
    .filter((r) => r.product_id === product.id)
    .map((r) => ({ ingredientId: r.ingredient_id, qty: String(r.quantity_per_unit) }))
  setNewProductRecipes(productRecipes)

  const productMaterials = materialUsages
    .filter((u) => u.product_id === product.id)
    .map((u) => ({
      materialId: u.material_id,
      qty: String(u.quantity_per_unit),
      packagingStyleId: u.packaging_style_id ?? '',
    }))
  setNewProductMaterials(productMaterials)

  setProductDialogOpen(true)
}
```

- [ ] **Step 2: 在產品 Badge 旁加入「配方」按鈕**

找到產品列表 render 區域，在每個產品 Badge 後加入按鈕（約 405-430 行，於 `<ActiveToggle>` 前）：

```tsx
<Button
  variant="ghost"
  size="icon-xs"
  onClick={() => openEditProduct(product)}
  title="編輯配方"
>
  📋
</Button>
```

Edit instruction：在現有 `<ActiveToggle>` 那行之前插入此 Button。確認 flex container 有 `gap-1.5`（已有）。

- [ ] **Step 3: 驗證編譯**

```bash
npx tsc --noEmit
```

預期：無錯誤。

- [ ] **Step 4: 功能測試**

使用者：

1. 開 `/settings`
2. 找到 Task 8 建立的「試吃盒」，點 📋 按鈕
3. Dialog 應顯示：分類 disabled、名稱「試吃盒」、3 行原料、1 行包材皆已預填
4. 把「經典原味」數量從 1 改成 2，點「儲存」
5. 再開編輯 → 數量應為 2（資料持久化）
6. 到 SQL Editor 檢查：
   ```sql
   SELECT cb.name, pr.quantity_per_unit
   FROM product_recipe pr
   JOIN products p ON p.id = pr.product_id
   JOIN products cb ON cb.id = pr.ingredient_id
   WHERE p.name = '試吃盒';
   ```
   預期：經典原味 2、伯爵紅茶 0.5、茉莉花茶 0.5

- [ ] **Step 5: Commit + Push**

```bash
git add src/app/settings/page.tsx
git commit -m "feat(settings): 新增既有產品配方編輯按鈕（📋）"
git push
```

---

## Phase 5: 試吃/耗損 Dialog + 列表

### Task 10: StockAdjustmentDialog 元件

**Files**:
- Create: `src/components/stock-adjustment-dialog.tsx`

- [ ] **Step 1: 建立元件檔案**

建立 `src/components/stock-adjustment-dialog.tsx`，內容：

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PlusIcon, XIcon } from 'lucide-react'
import type { Product, AdjustmentType, DeductMode } from '@/lib/types'

export interface AdjustmentItemInput {
  productId: string
  quantity: string
  deductMode: DeductMode
}

export interface AdjustmentInput {
  adjustmentType: AdjustmentType
  note: string
  items: AdjustmentItemInput[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
  initialValue?: AdjustmentInput  // 編輯模式
  onSave: (value: AdjustmentInput) => Promise<void>
}

export function StockAdjustmentDialog({
  open, onOpenChange, products, initialValue, onSave,
}: Props) {
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('sample')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<AdjustmentItemInput[]>([
    { productId: '', quantity: '1', deductMode: 'finished' },
  ])
  const [saving, setSaving] = useState(false)

  // 預填編輯資料
  useEffect(() => {
    if (open && initialValue) {
      setAdjustmentType(initialValue.adjustmentType)
      setNote(initialValue.note)
      setItems(initialValue.items.length > 0 ? initialValue.items : [
        { productId: '', quantity: '1', deductMode: 'finished' },
      ])
    } else if (open && !initialValue) {
      setAdjustmentType('sample')
      setNote('')
      setItems([{ productId: '', quantity: '1', deductMode: 'finished' }])
    }
  }, [open, initialValue])

  const addItem = () =>
    setItems((prev) => [...prev, { productId: '', quantity: '1', deductMode: 'finished' }])

  const removeItem = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i))

  const updateItem = (i: number, field: keyof AdjustmentItemInput, value: string) =>
    setItems((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)),
    )

  const handleSave = async () => {
    const validItems = items.filter((i) => i.productId && parseFloat(i.quantity) > 0)
    if (validItems.length === 0) {
      alert('請至少新增一個扣減項目')
      return
    }
    setSaving(true)
    try {
      await onSave({ adjustmentType, note, items: validItems })
      onOpenChange(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`儲存失敗：${msg}`)
    } finally {
      setSaving(false)
    }
  }

  const finishedProducts = products.filter(
    (p) => p.is_active && ['cake', 'tube', 'cookie', 'single_cake'].includes(p.category),
  )
  const ingredientProducts = products.filter(
    (p) => p.is_active && ['cake_bar', 'tube_pkg'].includes(p.category),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>今日試吃 / 耗損</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>類型</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={adjustmentType === 'sample'}
                  onChange={() => setAdjustmentType('sample')}
                />
                試吃
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={adjustmentType === 'waste'}
                  onChange={() => setAdjustmentType('waste')}
                />
                耗損
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>備註（可選）</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註" />
          </div>

          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-500">扣減項目</Label>
              <Button type="button" variant="ghost" size="xs" onClick={addItem}>
                <PlusIcon className="size-3" /> 新增項目
              </Button>
            </div>
            {items.map((row, i) => {
              const productList = row.deductMode === 'finished' ? finishedProducts : ingredientProducts
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="radio"
                        checked={row.deductMode === 'finished'}
                        onChange={() => {
                          updateItem(i, 'deductMode', 'finished')
                          updateItem(i, 'productId', '')
                        }}
                      />
                      成品
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="radio"
                        checked={row.deductMode === 'ingredient'}
                        onChange={() => {
                          updateItem(i, 'deductMode', 'ingredient')
                          updateItem(i, 'productId', '')
                        }}
                      />
                      原料
                    </label>
                  </div>
                  <select
                    value={row.productId}
                    onChange={(e) => updateItem(i, 'productId', e.target.value)}
                    className="flex h-8 flex-1 min-w-[120px] rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
                  >
                    <option value="" disabled>選擇產品</option>
                    {productList.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.quantity}
                    onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                    className="h-8 w-20"
                    placeholder="數量"
                  />
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeItem(i)}>
                    <XIcon className="size-3" />
                  </Button>
                </div>
              )
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? '儲存中...' : '儲存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: 驗證編譯**

```bash
npx tsc --noEmit
```

預期：無錯誤。

- [ ] **Step 3: Commit + Push**

```bash
git add src/components/stock-adjustment-dialog.tsx
git commit -m "feat(components): 新增 StockAdjustmentDialog 元件"
git push
```

---

### Task 11: 日期頁面 — 按鈕、列表、Dialog 接線

**Files**:
- Modify: `src/app/calendar/[date]/page.tsx`

- [ ] **Step 1: 新增 adjustments state 與 fetch**

找到 state 區域，新增：

```typescript
const [adjustments, setAdjustments] = useState<(StockAdjustment & { items: StockAdjustmentItem[] })[]>([])
const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false)
const [editingAdjustment, setEditingAdjustment] = useState<{
  id: string
  value: AdjustmentInput
} | null>(null)
```

import 區新增：

```typescript
import type { StockAdjustment, StockAdjustmentItem } from '@/lib/types'
import { StockAdjustmentDialog } from '@/components/stock-adjustment-dialog'
import type { AdjustmentInput } from '@/components/stock-adjustment-dialog'
import {
  applyIngredientDeductions as applyIngredientDeductionsHelper,
  applyMaterialDeductions as applyMaterialDeductionsHelper,
  calculateIngredientDeductions,
  calculateMaterialDeductions as calcMaterialDeductions2,
  reverseIngredientDeductions as reverseIngredientHelper,
  reverseMaterialDeductions as reverseMaterialHelper,
  deductDirectIngredient,
} from '@/lib/stock'
```

在 fetch 區域新增 `fetchAdjustments`：

```typescript
const fetchAdjustments = useCallback(async () => {
  const { data } = await supabase
    .from('stock_adjustments')
    .select(`
      id, date, adjustment_type, note, created_at,
      stock_adjustment_items (id, adjustment_id, product_id, quantity, deduct_mode)
    `)
    .eq('date', dateStr)
    .order('created_at', { ascending: false })

  if (data) {
    type Row = StockAdjustment & { stock_adjustment_items: StockAdjustmentItem[] }
    setAdjustments(
      (data as Row[]).map((a) => ({
        ...a,
        items: a.stock_adjustment_items,
      })),
    )
  }
}, [dateStr])
```

在訂單 fetch useEffect 中也呼叫 `fetchAdjustments()`（與 orders 一起依賴 dateStr）。

- [ ] **Step 2: 新增 `handleSaveAdjustment` 函式**

在其他 handler 附近新增：

```typescript
const handleSaveAdjustment = async (value: AdjustmentInput) => {
  // 編輯模式：先反轉舊扣減 + 刪舊 items
  if (editingAdjustment) {
    await reverseIngredientHelper(supabase, `adjust:${editingAdjustment.id}`)
    await reverseMaterialHelper(supabase, `adjust:${editingAdjustment.id}`)
    await supabase.from('stock_adjustment_items').delete().eq('adjustment_id', editingAdjustment.id)
    await supabase
      .from('stock_adjustments')
      .update({
        adjustment_type: value.adjustmentType,
        note: value.note || null,
      })
      .eq('id', editingAdjustment.id)
  }

  // 新增模式：insert parent
  let adjustmentId: string
  if (editingAdjustment) {
    adjustmentId = editingAdjustment.id
  } else {
    const { data, error } = await supabase
      .from('stock_adjustments')
      .insert({
        date: dateStr,
        adjustment_type: value.adjustmentType,
        note: value.note || null,
      })
      .select()
      .single()
    if (error || !data) throw new Error(error?.message ?? 'insert adjustment failed')
    adjustmentId = data.id
  }

  // Insert items
  const itemRows = value.items.map((i) => ({
    adjustment_id: adjustmentId,
    product_id: i.productId,
    quantity: parseFloat(i.quantity),
    deduct_mode: i.deductMode,
  }))
  const { error: itemErr } = await supabase.from('stock_adjustment_items').insert(itemRows)
  if (itemErr) throw new Error(itemErr.message)

  // 計算扣減
  const referenceNote = `adjust:${adjustmentId}`
  const finishedEntries: [string, number][] = []
  for (const i of value.items) {
    if (i.deductMode === 'finished') {
      finishedEntries.push([i.productId, parseFloat(i.quantity)])
    } else {
      await deductDirectIngredient(supabase, i.productId, parseFloat(i.quantity), referenceNote, dateStr)
    }
  }

  if (finishedEntries.length > 0) {
    // Ingredient deductions via recipe
    const ingredientDeductions = calculateIngredientDeductions(finishedEntries, recipes)
    await applyIngredientDeductionsHelper(supabase, ingredientDeductions, referenceNote, dateStr)

    // Material deductions（試吃/耗損不綁特定包裝款式，packagingResolver 一律回 null → 只匹配 universal usage）
    const { deductions: materialDeductions } = calcMaterialDeductions2(
      finishedEntries,
      products,
      materialUsages,
      () => null,
      (id) => packagingStyles.find((ps) => ps.id === id)?.name ?? null,
    )
    await applyMaterialDeductionsHelper(supabase, materialDeductions, referenceNote, dateStr)
  }

  setEditingAdjustment(null)
  fetchAdjustments()
}

const handleDeleteAdjustment = async (id: string) => {
  if (!confirm('確定刪除此筆試吃/耗損？相關庫存扣減會一併回沖。')) return
  await reverseIngredientHelper(supabase, `adjust:${id}`)
  await reverseMaterialHelper(supabase, `adjust:${id}`)
  await supabase.from('stock_adjustments').delete().eq('id', id)
  fetchAdjustments()
}

const handleEditAdjustment = (a: StockAdjustment & { items: StockAdjustmentItem[] }) => {
  setEditingAdjustment({
    id: a.id,
    value: {
      adjustmentType: a.adjustment_type,
      note: a.note ?? '',
      items: a.items.map((item) => ({
        productId: item.product_id,
        quantity: String(item.quantity),
        deductMode: item.deduct_mode,
      })),
    },
  })
  setAdjustmentDialogOpen(true)
}
```

- [ ] **Step 3: 在 header 按鈕列新增按鈕**

找到 header 按鈕區（含「匯出」「新增訂單」的 flex 容器），在「新增訂單」按鈕後新增：

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    setEditingAdjustment(null)
    setAdjustmentDialogOpen(true)
  }}
>
  🍰 今日試吃/耗損
</Button>
```

- [ ] **Step 4: 在訂單列表下方新增試吃/耗損列表**

找到訂單列表的結束 `</Card>`（或對應容器），於其後插入：

```tsx
{adjustments.length > 0 && (
  <Card className="mt-4">
    <CardHeader>
      <CardTitle className="text-base">今日試吃 / 耗損</CardTitle>
    </CardHeader>
    <CardContent className="space-y-2">
      {adjustments.map((a) => (
        <div key={a.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={a.adjustment_type === 'sample' ? 'default' : 'destructive'}>
              {a.adjustment_type === 'sample' ? '試吃' : '耗損'}
            </Badge>
            <span className="text-gray-700">
              {a.items.map((it) => {
                const product = products.find((p) => p.id === it.product_id)
                const modeLabel = it.deduct_mode === 'finished' ? '成品' : '原料'
                return `${product?.name ?? '?'} × ${it.quantity} (${modeLabel})`
              }).join('、')}
            </span>
            {a.note && <span className="text-xs text-gray-400">— {a.note}</span>}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" onClick={() => handleEditAdjustment(a)}>
              ✏️
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteAdjustment(a.id)}>
              🗑️
            </Button>
          </div>
        </div>
      ))}
    </CardContent>
  </Card>
)}
```

- [ ] **Step 5: 在頁面末端掛載 Dialog**

於 return 語句接近結尾處（其他 Dialog 旁），加入：

```tsx
<StockAdjustmentDialog
  open={adjustmentDialogOpen}
  onOpenChange={(open) => {
    setAdjustmentDialogOpen(open)
    if (!open) setEditingAdjustment(null)
  }}
  products={products}
  initialValue={editingAdjustment?.value}
  onSave={handleSaveAdjustment}
/>
```

- [ ] **Step 6: 驗證編譯**

```bash
npx tsc --noEmit
```

預期：無錯誤。若有 import 命名衝突（Task 5 也 import 了 helper），調整 alias 名稱避免重複。

- [ ] **Step 7: 建構驗證**

```bash
npm run build
```

預期：build 成功。

- [ ] **Step 8: 功能測試**

```bash
npm run dev
```

使用者開啟 `/calendar/2026-04-17`（或今日日期）：

1. 點「🍰 今日試吃/耗損」 → Dialog 開啟
2. 類型選「試吃」、備註「客人試吃活動」
3. 新增項目：
   - 成品 | 試吃盒 × 2
   - 原料 | 經典原味 × 0.5
4. 儲存 → 列表顯示一筆「試吃：試吃盒 × 2 (成品)、經典原味 × 0.5 (原料)」
5. 到 `/inventory` 檢查：經典原味 cake_bar 扣 2×1 + 0.5 = 2.5 條、伯爵 2×0.5 = 1 條、茉莉 2×0.5 = 1 條
6. 回日期頁，點 ✏️ 編輯 → 把「試吃盒」數量改為 3 → 儲存
7. 到 `/inventory` 檢查：扣減變 3×1 + 0.5 = 3.5 條經典 + 伯爵 1.5 + 茉莉 1.5
8. 點 🗑️ 刪除 → 列表消失、`/inventory` 回沖到原始值

- [ ] **Step 9: Commit + Push**

```bash
git add src/app/calendar/[date]/page.tsx
git commit -m "feat(calendar): 新增今日試吃/耗損按鈕、列表與 CRUD 邏輯"
git push
```

---

## Phase 6: Dashboard 試吃統計

### Task 12: 儀表板 — 本月試吃次數卡片

**Files**:
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: 新增 `sampleCount` state 與 fetch**

找到 dashboard state 區域，新增：

```typescript
const [sampleCount, setSampleCount] = useState(0)
```

在 fetch 邏輯中新增（通常有 `fetchStats` / `useEffect`）：

```typescript
const fetchSampleCount = async () => {
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')
  const { count } = await supabase
    .from('stock_adjustments')
    .select('*', { count: 'exact', head: true })
    .eq('adjustment_type', 'sample')
    .gte('date', monthStart)
    .lte('date', monthEnd)
  setSampleCount(count ?? 0)
}
```

確認 `startOfMonth` / `endOfMonth` 已 import from date-fns（依 dashboard 既有用法）。

在 mount `useEffect` 中呼叫 `fetchSampleCount()`。

- [ ] **Step 2: 新增卡片**

找到現有 5 個統計卡片的 grid（5 個 Card 元素），在其後新增：

```tsx
<Card>
  <CardHeader className="pb-2">
    <CardTitle className="text-xs text-gray-500">本月試吃次數</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold text-green-600">{sampleCount}</div>
    <p className="text-xs text-gray-400">活動筆數</p>
  </CardContent>
</Card>
```

若 grid 是 `sm:grid-cols-5`，改為 `sm:grid-cols-3 lg:grid-cols-6`（6 個卡片）。

- [ ] **Step 3: 驗證編譯與建構**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 4: 視覺驗證**

```bash
npm run dev
```

開啟 `/dashboard`，確認：
- 6 個統計卡片並列顯示
- 「本月試吃次數」顯示數字（若本月已有試吃記錄則為該數；否則為 0）

- [ ] **Step 5: Commit + Push**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): 新增本月試吃次數卡片"
git push
```

---

### Task 13: 儀表板 — 本月試吃品項分布 BarChart

**Files**:
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: 新增 `sampleBreakdown` state 與 fetch**

在 state 區新增：

```typescript
const [sampleBreakdown, setSampleBreakdown] = useState<{ name: string; qty: number }[]>([])
```

在 fetch 區新增：

```typescript
const fetchSampleBreakdown = async () => {
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd')
  const { data } = await supabase
    .from('stock_adjustment_items')
    .select(`
      product_id, quantity, deduct_mode,
      adjustment:stock_adjustments!inner(date, adjustment_type)
    `)
    .eq('adjustment.adjustment_type', 'sample')
    .gte('adjustment.date', monthStart)
    .lte('adjustment.date', monthEnd)

  if (!data) {
    setSampleBreakdown([])
    return
  }

  // Aggregate by product_id
  const map: Record<string, number> = {}
  for (const row of data as Array<{ product_id: string; quantity: number }>) {
    map[row.product_id] = (map[row.product_id] || 0) + row.quantity
  }

  // Fetch products for name resolution
  const { data: productsData } = await supabase
    .from('products')
    .select('id, name')
    .in('id', Object.keys(map).length > 0 ? Object.keys(map) : ['__none__'])

  const productNameMap: Record<string, string> = {}
  for (const p of (productsData ?? [])) productNameMap[p.id] = p.name

  setSampleBreakdown(
    Object.entries(map)
      .map(([pid, qty]) => ({ name: productNameMap[pid] ?? '未知', qty }))
      .sort((a, b) => b.qty - a.qty),
  )
}
```

在 mount useEffect 呼叫 `fetchSampleBreakdown()`。

- [ ] **Step 2: 新增圖表**

找到現有 4 個圖表的區域，在其後新增：

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-base">本月試吃品項分布</CardTitle>
  </CardHeader>
  <CardContent>
    {sampleBreakdown.length === 0 ? (
      <p className="py-8 text-center text-sm text-gray-400">本月尚無試吃紀錄</p>
    ) : (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={sampleBreakdown} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="name" type="category" width={120} />
          <Tooltip />
          <Bar dataKey="qty" fill="#10b981" />
        </BarChart>
      </ResponsiveContainer>
    )}
  </CardContent>
</Card>
```

確認 import（若現有 import 已涵蓋則略過）：

```typescript
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
```

- [ ] **Step 3: 驗證編譯與建構**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 4: 視覺驗證**

```bash
npm run dev
```

使用者開啟 `/dashboard`：
- 5 個圖表並列（或依原本 layout 擴充）
- 若本月有試吃紀錄 → 看到綠色水平長條圖
- 若無試吃紀錄 → 顯示「本月尚無試吃紀錄」

可手動到任意日期頁面新增一筆試吃（試吃盒 × 1）→ 回 dashboard 確認圖表顯示該產品及數量。

- [ ] **Step 5: Commit + Push**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): 新增本月試吃品項分布 BarChart"
git push
```

---

## Phase 7: Documentation

### Task 14: 更新 LAD.md

**Files**:
- Modify: `LAD.md`

- [ ] **Step 1: 更新頁面總覽表「設定」列**

找到「頁面總覽」表中 `/settings` 那列的說明，把「設定 (CRUD)」改為：

```
| 設定 | `/settings` | ✅ 完成 | 產品/包裝/烙印 CRUD、**新增產品可同步設定原料配方與包材消耗**、每項產品可📋編輯配方 |
```

- [ ] **Step 2: 更新「日訂單管理」列**

把 `/calendar/[date]` 那列改為：

```
| 日訂單管理 | `/calendar/[date]` | ✅ 完成 | 新增/編輯/刪除、**資料驅動庫存扣減**、CSV匯出、Realtime、**今日試吃/耗損 CRUD** |
```

- [ ] **Step 3: 更新「統計儀表板」列**

把 `/dashboard` 那列改為：

```
| 統計儀表板 | `/dashboard` | ✅ 完成 | 6 統計卡片 + 5 Recharts 圖表（含試吃統計） |
```

- [ ] **Step 4: 在「訂單功能」段落後新增「試吃/耗損功能」段落**

找到 `### 訂單功能` 區塊結束後（即 `### Realtime 同步` 之前），插入：

```markdown
### 試吃/耗損功能（非訂單庫存扣減）

- **類型**：`sample`（試吃）/ `waste`（耗損）分開記錄
- **扣減模式**：
  - 「扣成品」→ 透過 `product_recipe` 展開為原料扣減 + 透過 `product_material_usage` 展開為包材扣減
  - 「扣原料」→ 直接扣 cake_bar / tube_pkg 庫存
  - 包材耗損暫不支援（見設計文件 Section 8 非範圍）
- **資料表**：`stock_adjustments`（父）+ `stock_adjustment_items`（子）
- **reference_note 格式**：`adjust:${adjustmentId}`
- 日頁面（`/calendar/[date]`）右上角「今日試吃/耗損」按鈕開啟 Dialog，列表顯示於訂單卡片下方
```

- [ ] **Step 5: 更新「核心表」段落**

找到「### 核心表」區塊，在 `inventory` 之後新增：

```
product_recipe    — 原料配方 BOM (product_id, ingredient_id, quantity_per_unit)
                   ingredient_id 指向 cake_bar 或 tube_pkg 類別的 product
stock_adjustments — 試吃/耗損 (date, adjustment_type, note)
                   adjustment_type: sample / waste
stock_adjustment_items — 扣減項目 (adjustment_id, product_id, quantity, deduct_mode)
                   deduct_mode: finished (透過 recipe 展開) / ingredient (直接扣)
```

- [ ] **Step 6: 更新「庫存扣減機制」段落**

把「### 庫存扣減機制」段落完整替換為：

```markdown
### 庫存扣減機制

- **資料驅動**：訂單 / 試吃 / 耗損的「扣成品」模式透過 `product_recipe` 展開為原料扣減、透過 `product_material_usage` 展開為包材扣減
- 訂單建立時：依 order_items 對每個產品查 recipe → insert `inventory` 記錄（type='outbound', quantity=負數）
- `reference_note` 格式：
  - 訂單：`order:${orderId}`
  - 試吃/耗損：`adjust:${adjustmentId}`
- `date` 欄位：訂單為 `order_date`、試吃/耗損為該筆 adjustment 的 `date`
- 刪除/編輯時：先刪除對應 reference_note 的記錄，再重新計算
- **tube_pkg 扣減例外**：保留硬編碼「按訂單 `tube_packaging_id` 對應包裝款式名稱、扣同名 tube_pkg 產品」邏輯（per-packaging 屬性不進 recipe）
```

- [ ] **Step 7: 更新 Migrations 表**

找到 `### Migrations` 表，在 `009_material_lead_time.sql` 那列後面新增：

```
| `010_product_recipe.sql` | 新增 product_recipe 表、seed 15 筆既有產品配方（6 cake + 3 tube + 3 single_cake） |
| `011_stock_adjustments.sql` | 新增 stock_adjustments + stock_adjustment_items 父子表 |
```

- [ ] **Step 8: 更新「待執行的 SQL Migration」段落**

找到檔案末尾「## 待執行的 SQL Migration」，在其 SQL 區塊結尾新增：

```sql

-- === Migration 010: product_recipe ===

-- (完整 SQL 見 supabase/migrations/010_product_recipe.sql)
-- 要點：建 product_recipe 表 + RLS + seed 15 筆既有配方

-- === Migration 011: stock_adjustments ===

-- (完整 SQL 見 supabase/migrations/011_stock_adjustments.sql)
-- 要點：建 stock_adjustments 父子表 + RLS + CHECK constraints
```

- [ ] **Step 9: 更新 Realtime 段落（可選）**

在檔案末尾「## Realtime 啟用步驟」的 `ALTER PUBLICATION` 範例中，可視需求加入：

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE stock_adjustments;
ALTER PUBLICATION supabase_realtime ADD TABLE stock_adjustment_items;
```

（若使用者希望試吃/耗損多人同步即時更新）

- [ ] **Step 10: Commit + Push**

```bash
git add LAD.md
git commit -m "docs: 更新 LAD.md 反映 Product Recipe BOM 與試吃/耗損功能"
git push
```

---

## 整體驗證 Checklist

完成所有 Task 後，使用者執行完整回歸測試：

### Migration 驗證

- [ ] Supabase SQL Editor: `SELECT COUNT(*) FROM product_recipe` = 15
- [ ] Supabase SQL Editor: `SELECT COUNT(*) FROM stock_adjustments` ≥ 0（可 insert/delete 正常）

### 訂單回歸

- [ ] cake 組合盒訂單扣減數字與遷移前一致
- [ ] cake 單口味盒訂單扣減 2 條同口味
- [ ] tube 訂單扣減 1 條 cake_bar + 1 個 tube_pkg
- [ ] single_cake 訂單扣減 0.25 條
- [ ] 編輯訂單後扣減正確回沖並重算
- [ ] 刪除訂單後所有 inventory 記錄清除

### 新功能驗證

- [ ] `/settings` 新增「試吃盒」(1 經典 + 0.5 伯爵 + 0.5 茉莉) 成功
- [ ] 為試吃盒下訂單 5 盒 → cake_bar 扣 5/2.5/2.5
- [ ] 📋 編輯試吃盒配方成功並持久化
- [ ] 今日試吃扣成品 + 扣原料 → inventory 正確扣減
- [ ] 編輯試吃記錄 → inventory 回沖並重算
- [ ] 刪除試吃記錄 → inventory 清除

### 儀表板驗證

- [ ] 本月試吃次數卡片正確顯示
- [ ] 本月試吃品項分布 BarChart 正確顯示
- [ ] 耗損不影響試吃卡片/圖表

---

## 待使用者手動執行清單（總結）

完成所有 Task 後需手動執行：

1. **到 Supabase Dashboard > SQL Editor**：
   - 執行 `supabase/migrations/010_product_recipe.sql`（Task 1 之後）
   - 執行 `supabase/migrations/011_stock_adjustments.sql`（Task 2 之後）
2. **（可選）到 Database > Publications**：
   - 將 `stock_adjustments`、`stock_adjustment_items` 加入 `supabase_realtime`
3. **Vercel 自動部署**：push 後 1-2 分鐘內完成；打開 https://packaging-calendar.vercel.app 驗證新功能

---

## 自我審查結果（Self-Review）

**1. Spec coverage**
| Spec 章節 | 對應 Task |
|-----------|----------|
| Section 1 資料結構 — product_recipe | Task 1 |
| Section 1 資料結構 — stock_adjustments | Task 2 |
| Section 2 Migration 010 | Task 1 |
| Section 3 Migration 011 | Task 2 |
| Section 4 設定頁面 UI | Task 6–9 |
| Section 5 日頁面 UI | Task 11 |
| Section 6 扣減 helper + 訂單改造 | Task 3, 4, 5 |
| Section 6 試吃/耗損扣減 | Task 10–11 |
| Section 7 儀表板 | Task 12, 13 |
| Section 9 驗證清單 | 每個 Task 的 verification step + 整體驗證 checklist |
| Types 擴充 | Task 3 |
| Docs 更新 | Task 14 |

**2. Placeholder scan**: 無 TBD/TODO/模糊描述。所有程式碼區塊皆具體完整。

**3. Type consistency**: `AdjustmentInput` / `AdjustmentItemInput` 在 Task 10 定義後於 Task 11 使用；`IngredientDeductions` / `MaterialDeductions` 在 Task 4 定義後於 Task 5、11 使用；`ProductRecipe` 在 Task 3 定義後於 Task 4、5、6、11 使用。命名一致。

**4. 潛在衝突檢查**: Task 11 import helper 名稱使用 alias（例如 `applyIngredientDeductionsHelper`）以避免與 Task 5 的 wrapper 函式（`applyDeductions`）重複。若 Task 5 的 wrapper 仍會使用到，保留別名 import 避免命名衝突。
