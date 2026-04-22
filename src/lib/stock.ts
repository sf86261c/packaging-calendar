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

// ─── Atomic RPC wrappers (migration 016) ────────────────────────
// 把 reverse + apply 包在 Postgres function 內為單一 transaction，
// 避免 client 中途斷線導致 inventory 永久遺失。

export async function replaceOrderInventory(
  supabase: SupabaseClient,
  orderId: string,
  ingredientDeductions: IngredientDeductions,
  materialDeductions: MaterialDeductions,
  date: string,
): Promise<void> {
  const { error } = await supabase.rpc('replace_order_inventory', {
    p_order_id: orderId,
    p_ingredient_deductions: ingredientDeductions,
    p_material_deductions: materialDeductions,
    p_date: date,
  })
  if (error) throw new Error(`寫入訂單庫存失敗：${error.message}`)
}

export async function deleteOrderWithInventory(
  supabase: SupabaseClient,
  orderId: string,
): Promise<void> {
  const { error } = await supabase.rpc('delete_order_with_inventory', {
    p_order_id: orderId,
  })
  if (error) throw new Error(`刪除訂單失敗：${error.message}`)
}

export async function replaceAdjustmentInventory(
  supabase: SupabaseClient,
  adjustmentId: string,
  ingredientDeductions: IngredientDeductions,
  materialDeductions: MaterialDeductions,
  date: string,
): Promise<void> {
  const { error } = await supabase.rpc('replace_adjustment_inventory', {
    p_adjustment_id: adjustmentId,
    p_ingredient_deductions: ingredientDeductions,
    p_material_deductions: materialDeductions,
    p_date: date,
  })
  if (error) throw new Error(`寫入調整庫存失敗：${error.message}`)
}

export async function deleteAdjustmentWithInventory(
  supabase: SupabaseClient,
  adjustmentId: string,
): Promise<void> {
  const { error } = await supabase.rpc('delete_adjustment_with_inventory', {
    p_adjustment_id: adjustmentId,
  })
  if (error) throw new Error(`刪除調整失敗：${error.message}`)
}
