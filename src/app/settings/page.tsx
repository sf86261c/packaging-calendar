'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
// Note: base-ui Select uses Portal which conflicts with Dialog's modal focus trap.
// Using native <select> inside dialogs instead.
import { PlusIcon, CheckIcon, XIcon } from 'lucide-react'
import type { PackagingMaterial, ProductRecipe, ProductMaterialUsage } from '@/lib/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecipeRow {
  ingredientId: string
  qty: string
}

interface MaterialRow {
  materialId: string
  qty: string
  packagingStyleId: string  // '' = 全部適用 (universal match)
}

interface Product {
  id: string
  category: string
  name: string
  sort_order: number
  is_active: boolean
}

interface PackagingStyle {
  id: string
  name: string
  color_code: string
  category: string | null
  is_active: boolean
}

interface BrandingStyle {
  id: string
  name: string
  category: string | null
  is_active: boolean
}

// Category display config (keys must match DB products.category CHECK constraint)
const CATEGORY_LABELS: Record<string, string> = {
  cake: '蜂蜜蛋糕（盒）',
  cake_bar: '蛋糕原料（條）',
  tube: '旋轉筒',
  tube_pkg: '旋轉筒包裝',
  single_cake: '單入蛋糕',
  cookie: '曲奇',
}

const CATEGORY_ICONS: Record<string, string> = {
  cake: '🍰',
  cake_bar: '🍞',
  tube: '🫙',
  tube_pkg: '📦',
  single_cake: '🧁',
  cookie: '🍪',
}

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}))

// Packaging/branding applicable category labels (uses DB category values)
const PKG_CATEGORY_LABELS: Record<string, string> = {
  cake: '蜂蜜蛋糕',
  tube: '旋轉筒',
  single_cake: '單入蛋糕',
}

const PKG_CATEGORY_ICONS: Record<string, string> = {
  cake: '🍰',
  tube: '🫙',
  single_cake: '📦',
}

const PKG_CATEGORY_OPTIONS = Object.entries(PKG_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}))

// ---------------------------------------------------------------------------
// Inline editable name component
// ---------------------------------------------------------------------------

function InlineEditName({
  value,
  isActive,
  onSave,
}: {
  value: string
  isActive: boolean
  onSave: (newName: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) {
      onSave(trimmed)
    }
    setEditing(false)
  }

  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') cancel()
          }}
          className="h-6 w-32 text-xs"
          autoFocus
        />
        <Button variant="ghost" size="icon-xs" onClick={commit}>
          <CheckIcon className="size-3" />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={cancel}>
          <XIcon className="size-3" />
        </Button>
      </span>
    )
  }

  return (
    <span
      className={`cursor-pointer hover:underline ${
        !isActive ? 'text-gray-400 line-through' : ''
      }`}
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      title="點擊編輯"
    >
      {value}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Active toggle button (替代 Switch)
// ---------------------------------------------------------------------------

function ActiveToggle({
  isActive,
  onToggle,
}: {
  isActive: boolean
  onToggle: () => void
}) {
  return (
    <Button
      variant={isActive ? 'default' : 'outline'}
      size="xs"
      onClick={onToggle}
      className="min-w-[48px] text-[10px]"
    >
      {isActive ? '啟用' : '停用'}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const supabase = createClient()

  // --- State ---------------------------------------------------------------
  const [products, setProducts] = useState<Product[]>([])
  const [packagingStyles, setPackagingStyles] = useState<PackagingStyle[]>([])
  const [brandingStyles, setBrandingStyles] = useState<BrandingStyle[]>([])
  const [materials, setMaterials] = useState<PackagingMaterial[]>([])
  const [recipes, setRecipes] = useState<ProductRecipe[]>([])
  const [materialUsages, setMaterialUsages] = useState<ProductMaterialUsage[]>([])

  // Dialog states
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [packagingDialogOpen, setPackagingDialogOpen] = useState(false)
  const [brandingDialogOpen, setBrandingDialogOpen] = useState(false)

  // New item form states
  const [newProductCategory, setNewProductCategory] = useState('')
  const [newProductName, setNewProductName] = useState('')
  const [newPackagingName, setNewPackagingName] = useState('')
  const [newPackagingColor, setNewPackagingColor] = useState('#000000')
  const [newPackagingCategory, setNewPackagingCategory] = useState('')
  const [newBrandingName, setNewBrandingName] = useState('')
  const [newBrandingCategory, setNewBrandingCategory] = useState('')
  const [newProductRecipes, setNewProductRecipes] = useState<RecipeRow[]>([])
  const [newProductMaterials, setNewProductMaterials] = useState<MaterialRow[]>([])
  const [editingProductId, setEditingProductId] = useState<string | null>(null)

  // --- Fetch data ----------------------------------------------------------

  const fetchProducts = useCallback(async () => {
    const { data } = await supabase
      .from('products')
      .select('*')
      .order('sort_order')
    if (data) setProducts(data)
  }, [supabase])

  const fetchPackagingStyles = useCallback(async () => {
    const { data } = await supabase
      .from('packaging_styles')
      .select('*')
      .order('name')
    if (data) setPackagingStyles(data)
  }, [supabase])

  const fetchBrandingStyles = useCallback(async () => {
    const { data } = await supabase
      .from('branding_styles')
      .select('*')
      .order('name')
    if (data) setBrandingStyles(data)
  }, [supabase])

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

  useEffect(() => {
    fetchProducts()
    fetchPackagingStyles()
    fetchBrandingStyles()
    fetchMaterials()
    fetchRecipes()
    fetchMaterialUsages()
  }, [fetchProducts, fetchPackagingStyles, fetchBrandingStyles, fetchMaterials, fetchRecipes, fetchMaterialUsages])

  // --- Product CRUD --------------------------------------------------------

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

  const updateProductName = async (id: string, name: string) => {
    await supabase.from('products').update({ name }).eq('id', id)
    fetchProducts()
  }

  const toggleProductActive = async (id: string, currentActive: boolean) => {
    await supabase
      .from('products')
      .update({ is_active: !currentActive })
      .eq('id', id)
    fetchProducts()
  }

  // --- Recipe / material row handlers (used in Task 7 Dialog UI) -----------

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

  // --- Packaging style CRUD ------------------------------------------------

  const addPackagingStyle = async () => {
    const trimmed = newPackagingName.trim()
    if (!trimmed || !newPackagingCategory) return
    const { error } = await supabase.from('packaging_styles').insert({
      name: trimmed,
      color_code: newPackagingColor,
      category: newPackagingCategory,
    })
    if (error) {
      alert(`新增失敗：${error.message}`)
      return
    }
    setNewPackagingName('')
    setNewPackagingColor('#000000')
    setNewPackagingCategory('')
    setPackagingDialogOpen(false)
    fetchPackagingStyles()
  }

  const updatePackagingStyle = async (
    id: string,
    fields: Partial<Pick<PackagingStyle, 'name' | 'color_code'>>
  ) => {
    await supabase.from('packaging_styles').update(fields).eq('id', id)
    fetchPackagingStyles()
  }

  const togglePackagingActive = async (id: string, currentActive: boolean) => {
    await supabase
      .from('packaging_styles')
      .update({ is_active: !currentActive })
      .eq('id', id)
    fetchPackagingStyles()
  }

  // --- Branding style CRUD -------------------------------------------------

  const addBrandingStyle = async () => {
    const trimmed = newBrandingName.trim()
    if (!trimmed || !newBrandingCategory) return
    const { error } = await supabase.from('branding_styles').insert({
      name: trimmed,
      category: newBrandingCategory,
    })
    if (error) {
      alert(`新增失敗：${error.message}`)
      return
    }
    setNewBrandingName('')
    setNewBrandingCategory('')
    setBrandingDialogOpen(false)
    fetchBrandingStyles()
  }

  const updateBrandingName = async (id: string, name: string) => {
    await supabase.from('branding_styles').update({ name }).eq('id', id)
    fetchBrandingStyles()
  }

  const toggleBrandingActive = async (id: string, currentActive: boolean) => {
    await supabase
      .from('branding_styles')
      .update({ is_active: !currentActive })
      .eq('id', id)
    fetchBrandingStyles()
  }

  // --- Group products by category ------------------------------------------

  const productsByCategory = products.reduce<Record<string, Product[]>>(
    (acc, product) => {
      const cat = product.category
      return {
        ...acc,
        [cat]: [...(acc[cat] ?? []), product],
      }
    },
    {}
  )

  // --- Group packaging/branding by category --------------------------------

  const packagingByCategory = packagingStyles.reduce<Record<string, PackagingStyle[]>>(
    (acc, style) => {
      const cat = style.category || 'uncategorized'
      return { ...acc, [cat]: [...(acc[cat] ?? []), style] }
    },
    {}
  )

  const brandingByCategory = brandingStyles.reduce<Record<string, BrandingStyle[]>>(
    (acc, style) => {
      const cat = style.category || 'uncategorized'
      return { ...acc, [cat]: [...(acc[cat] ?? []), style] }
    },
    {}
  )

  // --- Render --------------------------------------------------------------

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        &#9881;&#65039; 設定
      </h1>

      <div className="space-y-4">
        {/* ============================================================= */}
        {/* 產品管理                                                       */}
        {/* ============================================================= */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">產品管理</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProductDialogOpen(true)}
            >
              <PlusIcon className="size-3.5" />
              新增
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(productsByCategory).map(([category, items]) => (
              <div key={category}>
                <p className="mb-1 text-xs text-gray-400">
                  {CATEGORY_ICONS[category] ?? '📋'}{' '}
                  {CATEGORY_LABELS[category] ?? category}
                </p>
                <div className="flex flex-wrap gap-2">
                  {items.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-1.5"
                    >
                      <Badge
                        variant={product.is_active ? 'outline' : 'secondary'}
                        className={
                          !product.is_active
                            ? 'text-gray-400 line-through opacity-60'
                            : ''
                        }
                      >
                        <InlineEditName
                          value={product.name}
                          isActive={product.is_active}
                          onSave={(name) => updateProductName(product.id, name)}
                        />
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => openEditProduct(product)}
                        title="編輯配方"
                      >
                        📋
                      </Button>
                      <ActiveToggle
                        isActive={product.is_active}
                        onToggle={() =>
                          toggleProductActive(product.id, product.is_active)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {products.length === 0 && (
              <p className="text-sm text-gray-400">尚無產品，請新增</p>
            )}
          </CardContent>
        </Card>

        {/* New product dialog */}
        <Dialog
          open={productDialogOpen}
          onOpenChange={(open) => {
            setProductDialogOpen(open)
            if (!open) resetProductForm()
          }}
        >
          <DialogContent className="w-[calc(100%-1rem)] max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden bg-white">
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
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <div className="flex min-w-0 flex-1 basis-[11rem] items-center gap-1.5">
                          <span className="shrink-0 rounded-md bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700">原料</span>
                          <select
                            value={row.ingredientId}
                            onChange={(e) => updateRecipeRow(i, 'ingredientId', e.target.value)}
                            className="flex h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
                          >
                            <option value="" disabled>選擇原料</option>
                            {products
                              .filter((p) => (p.category === 'cake_bar' || p.category === 'tube_pkg') && p.is_active)
                              .map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                          </select>
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.qty}
                          onChange={(e) => updateRecipeRow(i, 'qty', e.target.value)}
                          className="h-8 w-20 shrink-0"
                          placeholder="數量"
                        />
                        <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeRecipeRow(i)} className="shrink-0">
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
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <div className="flex min-w-0 flex-1 basis-[11rem] items-center gap-1.5">
                          <span className="shrink-0 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">包材</span>
                          <select
                            value={row.materialId}
                            onChange={(e) => updateMaterialRow(i, 'materialId', e.target.value)}
                            className="flex h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
                          >
                            <option value="" disabled>選擇包材</option>
                            {materials.map((m) => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.qty}
                          onChange={(e) => updateMaterialRow(i, 'qty', e.target.value)}
                          className="h-8 w-20 shrink-0"
                          placeholder="數量"
                        />
                        <div className="flex min-w-0 flex-1 basis-[9rem] items-center gap-1.5">
                          <span className="shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">款式</span>
                          <select
                            value={row.packagingStyleId}
                            onChange={(e) => updateMaterialRow(i, 'packagingStyleId', e.target.value)}
                            className="flex h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
                          >
                            <option value="">套用全部</option>
                            {packagingStyles
                              .filter((ps) => ps.category === newProductCategory && ps.is_active)
                              .map((ps) => (
                                <option key={ps.id} value={ps.id}>{ps.name}</option>
                              ))}
                          </select>
                        </div>
                        <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeMaterialRow(i)} className="shrink-0">
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
        </Dialog>

        {/* ============================================================= */}
        {/* 包裝款式管理                                                   */}
        {/* ============================================================= */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">包裝款式</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPackagingDialogOpen(true)}
            >
              <PlusIcon className="size-3.5" />
              新增
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(packagingByCategory).map(([category, styles]) => (
              <div key={category}>
                <p className="mb-1 text-xs text-gray-400">
                  {PKG_CATEGORY_ICONS[category] ?? '📋'}{' '}
                  {PKG_CATEGORY_LABELS[category] ?? '未分類'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {styles.map((style) => (
                    <div key={style.id} className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={
                          !style.is_active
                            ? 'text-gray-400 line-through opacity-60'
                            : ''
                        }
                      >
                        <span
                          className="mr-1 inline-block size-2.5 rounded-full"
                          style={{ backgroundColor: style.color_code }}
                        />
                        <InlineEditName
                          value={style.name}
                          isActive={style.is_active}
                          onSave={(name) =>
                            updatePackagingStyle(style.id, { name })
                          }
                        />
                      </Badge>
                      <ActiveToggle
                        isActive={style.is_active}
                        onToggle={() =>
                          togglePackagingActive(style.id, style.is_active)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {packagingStyles.length === 0 && (
              <p className="text-sm text-gray-400">尚無包裝款式，請新增</p>
            )}
          </CardContent>
        </Card>

        {/* New packaging style dialog */}
        <Dialog
          open={packagingDialogOpen}
          onOpenChange={setPackagingDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增包裝款式</DialogTitle>
              <DialogDescription>
                輸入款式名稱與代表色碼
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>適用類別</Label>
                <select
                  value={newPackagingCategory}
                  onChange={(e) => setNewPackagingCategory(e.target.value)}
                  className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="" disabled>選擇類別</option>
                  {PKG_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {PKG_CATEGORY_ICONS[opt.value]} {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>名稱</Label>
                <Input
                  value={newPackagingName}
                  onChange={(e) => setNewPackagingName(e.target.value)}
                  placeholder="輸入款式名稱"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addPackagingStyle()
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>色碼</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newPackagingColor}
                    onChange={(e) => setNewPackagingColor(e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border border-input"
                  />
                  <Input
                    value={newPackagingColor}
                    onChange={(e) => setNewPackagingColor(e.target.value)}
                    placeholder="#ff0000"
                    className="w-28"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addPackagingStyle}>新增</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================================= */}
        {/* 烙印款式管理                                                   */}
        {/* ============================================================= */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">烙印款式</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBrandingDialogOpen(true)}
            >
              <PlusIcon className="size-3.5" />
              新增
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(brandingByCategory).map(([category, styles]) => (
              <div key={category}>
                <p className="mb-1 text-xs text-gray-400">
                  {PKG_CATEGORY_ICONS[category] ?? '📋'}{' '}
                  {PKG_CATEGORY_LABELS[category] ?? '未分類'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {styles.map((style) => (
                    <div key={style.id} className="flex items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={
                          !style.is_active
                            ? 'text-gray-400 line-through opacity-60'
                            : ''
                        }
                      >
                        <InlineEditName
                          value={style.name}
                          isActive={style.is_active}
                          onSave={(name) => updateBrandingName(style.id, name)}
                        />
                      </Badge>
                      <ActiveToggle
                        isActive={style.is_active}
                        onToggle={() =>
                          toggleBrandingActive(style.id, style.is_active)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {brandingStyles.length === 0 && (
              <p className="text-sm text-gray-400">尚無烙印款式，請新增</p>
            )}
          </CardContent>
        </Card>

        {/* New branding style dialog */}
        <Dialog
          open={brandingDialogOpen}
          onOpenChange={setBrandingDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增烙印款式</DialogTitle>
              <DialogDescription>輸入烙印款式名稱</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>適用類別</Label>
                <select
                  value={newBrandingCategory}
                  onChange={(e) => setNewBrandingCategory(e.target.value)}
                  className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="" disabled>選擇類別</option>
                  {PKG_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {PKG_CATEGORY_ICONS[opt.value]} {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>名稱</Label>
                <Input
                  value={newBrandingName}
                  onChange={(e) => setNewBrandingName(e.target.value)}
                  placeholder="輸入款式名稱"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addBrandingStyle()
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addBrandingStyle}>新增</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================================= */}
        {/* 帳號管理                                                       */}
        {/* ============================================================= */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">帳號管理</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              可在 Supabase Dashboard 管理使用者帳號
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
