# 包材自動扣減 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 訂單建立/編輯/刪除時，根據 `product_material_usage` 對照表自動扣減包材庫存。

**Architecture:** 在 `[date]/page.tsx` 中新增包材扣減函數，沿用現有產品庫存扣減模式（前端計算 → 寫入 DB）。頁面載入時快取 `product_material_usage` 資料，建單時查找匹配的對照記錄計算各包材用量，寫入 `packaging_material_inventory`。

**Tech Stack:** Next.js 16 (App Router), Supabase (PostgreSQL), TypeScript

---

## File Map

| 檔案 | 動作 | 職責 |
|------|------|------|
| `src/lib/types.ts` | 修改 | `ProductMaterialUsage` 加 `packaging_style_id` 欄位 |
| `src/app/calendar/[date]/page.tsx` | 修改 | 新增包材扣減/回沖/警示邏輯 + 警示 UI |

---

### Task 1: 更新 ProductMaterialUsage 型別

**Files:**
- Modify: `src/lib/types.ts:92-99`

- [ ] **Step 1: 加入 packaging_style_id 欄位**

在 `ProductMaterialUsage` interface 加入 `packaging_style_id`：

```typescript
export interface ProductMaterialUsage {
  id: string
  product_id: string
  material_id: string
  packaging_style_id: string | null
  quantity_per_unit: number
  product?: Product
  material?: PackagingMaterial
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: ProductMaterialUsage 新增 packaging_style_id 欄位"
```

---

### Task 2: 載入 product_material_usage 資料

**Files:**
- Modify: `src/app/calendar/[date]/page.tsx:60-137`

- [ ] **Step 1: 新增 state**

在 line 63（`brandingStyles` state 之後）加入：

```typescript
const [materialUsages, setMaterialUsages] = useState<{ product_id: string; material_id: string; packaging_style_id: string | null; quantity_per_unit: number }[]>([])
const [materialWarning, setMaterialWarning] = useState<string | null>(null)
```

- [ ] **Step 2: 在 useEffect 中 fetch**

在 line 136（fetch branding_styles 之後）加入：

```typescript
supabase.from('product_material_usage').select('product_id, material_id, packaging_style_id, quantity_per_unit').then(({ data }) => {
  if (data) setMaterialUsages(data)
})
```

- [ ] **Step 3: Commit**

```bash
git add src/app/calendar/[date]/page.tsx
git commit -m "feat: 日訂單頁面載入 product_material_usage 資料"
```

---

### Task 3: 實作包材扣減核心函數

**Files:**
- Modify: `src/app/calendar/[date]/page.tsx:268-270`（在 `reverseDeductions` 之後插入）

- [ ] **Step 1: 寫 calculateMaterialDeductions**

在現有 `reverseDeductions` 函數之後，加入以下三個函數：

```typescript
// ─── Packaging material deduction ─────────────────────

const calculateMaterialDeductions = (
  itemEntries: [string, number][],
  orderCakePackagingId?: string,
  orderTubePackagingId?: string,
  singleCakePackagingMap?: Record<string, string>,
) => {
  const deductions: Record<string, number> = {}
  const missingCombos: { productName: string; packagingName: string | null }[] = []

  for (const [productId, qty] of itemEntries) {
    if (qty <= 0) continue
    const product = products.find((p: any) => p.id === productId)
    if (!product) continue
    // cake_bar and tube_pkg are raw materials — skip
    if (product.category === 'cake_bar' || product.category === 'tube_pkg') continue

    // Determine the packaging_style_id for this item
    let pkgStyleId: string | undefined
    if (product.category === 'cake') pkgStyleId = orderCakePackagingId
    else if (product.category === 'tube') pkgStyleId = orderTubePackagingId
    else if (product.category === 'single_cake') pkgStyleId = singleCakePackagingMap?.[productId]

    // Find matching usages: exact packaging_style_id match OR null (universal)
    const matched = materialUsages.filter(
      u => u.product_id === productId
        && (u.packaging_style_id === (pkgStyleId || null) || u.packaging_style_id === null)
    )

    if (matched.length === 0) {
      const pkgName = pkgStyleId
        ? packagingStyles.find(ps => ps.id === pkgStyleId)?.name ?? null
        : null
      missingCombos.push({ productName: product.name, packagingName: pkgName })
    }

    for (const usage of matched) {
      deductions[usage.material_id] =
        (deductions[usage.material_id] || 0) + qty * usage.quantity_per_unit
    }
  }

  return { deductions, missingCombos }
}
```

- [ ] **Step 2: 寫 applyMaterialDeductions**

```typescript
const applyMaterialDeductions = async (orderId: string, deductions: Record<string, number>) => {
  const records = Object.entries(deductions)
    .filter(([, qty]) => qty > 0)
    .map(([materialId, qty]) => ({
      material_id: materialId,
      type: 'outbound' as const,
      quantity: -Math.round(qty * 100) / 100,
      reference_note: `order:${orderId}`,
    }))
  if (records.length > 0) {
    await supabase.from('packaging_material_inventory').insert(records)
  }
}
```

- [ ] **Step 3: 寫 reverseMaterialDeductions**

```typescript
const reverseMaterialDeductions = async (orderId: string) => {
  await supabase.from('packaging_material_inventory').delete().eq('reference_note', `order:${orderId}`)
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/calendar/[date]/page.tsx
git commit -m "feat: 包材扣減核心函數 — calculate/apply/reverse"
```

---

### Task 4: 整合到 handleSaveOrder 和 handleDelete

**Files:**
- Modify: `src/app/calendar/[date]/page.tsx:304-342`

- [ ] **Step 1: 修改 handleSaveOrder 的 Edit mode**

在 `src/app/calendar/[date]/page.tsx` 的 Edit mode 區塊（目前 line 304-313），在現有 `applyDeductions` 之後加入包材扣減邏輯。整段改為：

```typescript
if (editingOrderId) {
  // ── Edit mode ──
  await supabase.from('orders').update(orderData).eq('id', editingOrderId)
  await supabase.from('order_items').delete().eq('order_id', editingOrderId)
  if (itemEntries.length > 0) {
    await supabase.from('order_items').insert(buildItemRows(editingOrderId))
  }
  // Product inventory
  await reverseDeductions(editingOrderId)
  const deductions = calculateDeductions(itemEntries, formTubePackaging || undefined)
  await applyDeductions(editingOrderId, deductions)
  // Packaging material inventory
  await reverseMaterialDeductions(editingOrderId)
  const matResult = calculateMaterialDeductions(
    itemEntries,
    formCakePackaging || undefined,
    formTubePackaging || undefined,
    formSingleCakePackaging,
  )
  await applyMaterialDeductions(editingOrderId, matResult.deductions)
  if (matResult.missingCombos.length > 0) {
    const lines = matResult.missingCombos.map(c =>
      `· ${c.productName}${c.packagingName ? ` — ${c.packagingName}` : ''}`
    )
    setMaterialWarning(`以下組合尚未設定包材對照，未扣減包材：\n${lines.join('\n')}`)
  }
}
```

- [ ] **Step 2: 修改 handleSaveOrder 的 Add mode**

Add mode 區塊（目前 line 314-328），在 `applyDeductions` 之後加入包材邏輯。整段改為：

```typescript
else {
  // ── Add mode ──
  const { data: order } = await supabase
    .from('orders')
    .insert(orderData)
    .select('id')
    .single()

  if (order) {
    if (itemEntries.length > 0) {
      await supabase.from('order_items').insert(buildItemRows(order.id))
    }
    // Product inventory
    const deductions = calculateDeductions(itemEntries, formTubePackaging || undefined)
    await applyDeductions(order.id, deductions)
    // Packaging material inventory
    const matResult = calculateMaterialDeductions(
      itemEntries,
      formCakePackaging || undefined,
      formTubePackaging || undefined,
      formSingleCakePackaging,
    )
    await applyMaterialDeductions(order.id, matResult.deductions)
    if (matResult.missingCombos.length > 0) {
      const lines = matResult.missingCombos.map(c =>
        `· ${c.productName}${c.packagingName ? ` — ${c.packagingName}` : ''}`
      )
      setMaterialWarning(`以下組合尚未設定包材對照，未扣減包材：\n${lines.join('\n')}`)
    }
  }
}
```

- [ ] **Step 3: 修改 handleDelete**

在 `handleDelete`（目前 line 337-342）的 `reverseDeductions` 之後加入：

```typescript
const handleDelete = async (orderId: string) => {
  if (!confirm('確定要刪除這筆訂單嗎？')) return
  await reverseDeductions(orderId)
  await reverseMaterialDeductions(orderId)
  await supabase.from('orders').delete().eq('id', orderId)
  fetchOrders()
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/calendar/[date]/page.tsx
git commit -m "feat: 訂單建立/編輯/刪除整合包材自動扣減"
```

---

### Task 5: 警示 UI

**Files:**
- Modify: `src/app/calendar/[date]/page.tsx`（頁面 return JSX 區塊頂部）

- [ ] **Step 1: 加入 materialWarning 自動清除**

在 `useEffect` 區塊（line 127 附近）之後加入：

```typescript
useEffect(() => {
  if (!materialWarning) return
  const timer = setTimeout(() => setMaterialWarning(null), 8000)
  return () => clearTimeout(timer)
}, [materialWarning])
```

- [ ] **Step 2: 加入警示 banner**

在頁面 return JSX 的最上層容器內（日期導航列之後），加入：

```tsx
{materialWarning && (
  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
    <div className="flex items-start justify-between">
      <pre className="whitespace-pre-wrap font-sans">{materialWarning}</pre>
      <button onClick={() => setMaterialWarning(null)} className="ml-2 text-amber-600 hover:text-amber-800">✕</button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/calendar/[date]/page.tsx
git commit -m "feat: 包材缺少對照時顯示警示 banner"
```

---

### Task 6: 更新 LAD.md + 推送

**Files:**
- Modify: `LAD.md`

- [ ] **Step 1: 更新 LAD.md**

1. 在「未完成事項 > 中優先」移除「包材自動扣減」項目
2. 在「訂單功能 > 庫存自動扣減」區塊補充包材扣減說明：
   - 訂單建立/編輯/刪除時，根據 `product_material_usage` 對照表自動扣減包材庫存
   - 缺少對照的組合顯示警示 banner

- [ ] **Step 2: Commit + Push**

```bash
git add LAD.md
git commit -m "docs: 更新 LAD.md — 包材自動扣減功能完成"
git push
```

---

## 驗證步驟

完成實作後，在瀏覽器中手動驗證：

1. **前置**：確認 `/materials` 已設定至少一組用量對照（如：經典原味+伯爵紅茶 + 祝福緞帶(米) → 某包材 × N）
2. **新增訂單**：建一筆含蛋糕的訂單 → 檢查 `/materials` 對應包材庫存是否減少
3. **編輯訂單**：修改數量 → 確認包材庫存正確重算
4. **刪除訂單**：刪除該訂單 → 確認包材庫存回沖
5. **警示測試**：建一筆沒有設定包材對照的產品+包裝組合 → 確認出現黃色警示 banner
6. **新包材測試**：在 `/materials` 新增一個包材 + 設定用量對照 → 建訂單驗證自動扣減
