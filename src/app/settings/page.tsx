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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlusIcon, CheckIcon, XIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// Category display config
const CATEGORY_LABELS: Record<string, string> = {
  cake_combo: '蜂蜜蛋糕（組合盒）',
  rotating_tube: '旋轉筒',
  single_cake: '單入蛋糕',
  cookie: '曲奇',
}

const CATEGORY_ICONS: Record<string, string> = {
  cake_combo: '🍰',
  rotating_tube: '🫙',
  single_cake: '📦',
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

  useEffect(() => {
    fetchProducts()
    fetchPackagingStyles()
    fetchBrandingStyles()
  }, [fetchProducts, fetchPackagingStyles, fetchBrandingStyles])

  // --- Product CRUD --------------------------------------------------------

  const addProduct = async () => {
    const trimmed = newProductName.trim()
    if (!trimmed || !newProductCategory) return
    await supabase.from('products').insert({
      category: newProductCategory,
      name: trimmed,
      sort_order: 99,
    })
    setNewProductName('')
    setNewProductCategory('')
    setProductDialogOpen(false)
    fetchProducts()
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

  // --- Packaging style CRUD ------------------------------------------------

  const addPackagingStyle = async () => {
    const trimmed = newPackagingName.trim()
    if (!trimmed || !newPackagingCategory) return
    await supabase.from('packaging_styles').insert({
      name: trimmed,
      color_code: newPackagingColor,
      category: newPackagingCategory,
    })
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
    await supabase.from('branding_styles').insert({
      name: trimmed,
      category: newBrandingCategory,
    })
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
        <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增產品</DialogTitle>
              <DialogDescription>
                選擇分類並輸入產品名稱
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>分類</Label>
                <Select
                  value={newProductCategory || undefined}
                  onValueChange={(v) => v && setNewProductCategory(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="選擇分類">
                      {newProductCategory ? `${CATEGORY_ICONS[newProductCategory] || ''} ${CATEGORY_LABELS[newProductCategory] || newProductCategory}` : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {CATEGORY_ICONS[opt.value]} {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>名稱</Label>
                <Input
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="輸入產品名稱"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addProduct()
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addProduct}>新增</Button>
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
                <Select
                  value={newPackagingCategory || undefined}
                  onValueChange={(v) => v && setNewPackagingCategory(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="選擇類別">
                      {newPackagingCategory
                        ? `${PKG_CATEGORY_ICONS[newPackagingCategory] || ''} ${PKG_CATEGORY_LABELS[newPackagingCategory] || newPackagingCategory}`
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PKG_CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {PKG_CATEGORY_ICONS[opt.value]} {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Select
                  value={newBrandingCategory || undefined}
                  onValueChange={(v) => v && setNewBrandingCategory(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="選擇類別">
                      {newBrandingCategory
                        ? `${PKG_CATEGORY_ICONS[newBrandingCategory] || ''} ${PKG_CATEGORY_LABELS[newBrandingCategory] || newBrandingCategory}`
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PKG_CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {PKG_CATEGORY_ICONS[opt.value]} {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
