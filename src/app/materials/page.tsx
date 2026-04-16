'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { Loader2, Plus, Package, Settings, AlertTriangle, CalendarDays, Pencil, Trash2, Ban } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

// ─── Constants ────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: 'cake', label: '蜂蜜蛋糕' },
  { value: 'cookie', label: '曲奇餅乾' },
  { value: 'tube', label: '旋轉筒' },
  { value: 'single_cake', label: '單入蛋糕' },
]

const PACKAGING_BY_CATEGORY: Record<string, string[]> = {
  cake: ['祝福緞帶(米)', '森林旋律(粉)', '歡樂派對(藍)'],
  tube: ['四季童話', '銀河探險', '馬戲團'],
  single_cake: ['愛心', '花園', '小熊'],
}

// ─── Interfaces ───────────────────────────────

interface Material {
  id: string
  name: string
  unit: string
  safety_stock: number
  lead_time_days: number
  is_active: boolean
  stock: number
}

interface UsageRow {
  id: string
  product_id: string
  material_id: string
  packaging_style_id: string | null
  quantity_per_unit: number
  product_name: string
  product_category: string
  packaging_name: string | null
}

interface MaterialRow {
  materialId: string
  qty: string
}

// ─── Component ────────────────────────────────

export default function MaterialsPage() {
  const supabase = createClient()
  const [materials, setMaterials] = useState<Material[]>([])
  const [usages, setUsages] = useState<UsageRow[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [packagingStyles, setPackagingStyles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Add material dialog
  const [addOpen, setAddOpen] = useState(false)
  const [matName, setMatName] = useState('')
  const [matUnit, setMatUnit] = useState('個')
  const [matSafety, setMatSafety] = useState('100')
  const [matLeadTime, setMatLeadTime] = useState('7')

  // Edit material dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState('')
  const [editName, setEditName] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editSafety, setEditSafety] = useState('')
  const [editLeadTime, setEditLeadTime] = useState('7')

  // Inbound dialog
  const [inboundOpen, setInboundOpen] = useState(false)
  const [inboundMat, setInboundMat] = useState('')
  const [inboundQty, setInboundQty] = useState('')
  const [inboundNote, setInboundNote] = useState('')

  // Usage mapping dialog (redesigned)
  const [usageOpen, setUsageOpen] = useState(false)
  const [usageCategory, setUsageCategory] = useState('')
  const [usageProducts, setUsageProducts] = useState<string[]>([])
  const [usagePackaging, setUsagePackaging] = useState('')
  const [usageMaterials, setUsageMaterials] = useState<MaterialRow[]>([{ materialId: '', qty: '1' }])

  // Date picker
  const [asOfDate, setAsOfDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  // ─── Data fetching ────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [matRes, invRes, usageRes, prodRes, pkgRes] = await Promise.all([
      supabase.from('packaging_materials').select('*').order('name'),
      supabase.from('packaging_material_inventory').select('material_id, quantity').lte('date', asOfDate),
      supabase.from('product_material_usage').select('id, product_id, material_id, packaging_style_id, quantity_per_unit, product:products(name, category)'),
      supabase.from('products').select('id, name, category').eq('is_active', true).order('sort_order'),
      supabase.from('packaging_styles').select('*').eq('is_active', true),
    ])

    const stockMap: Record<string, number> = {}
    if (invRes.data) {
      for (const inv of invRes.data) {
        stockMap[inv.material_id] = (stockMap[inv.material_id] || 0) + inv.quantity
      }
    }

    if (matRes.data) {
      setMaterials(matRes.data.map((m: any) => ({ ...m, stock: stockMap[m.id] || 0 })))
    }

    if (usageRes.data) {
      setUsages(usageRes.data.map((u: any) => ({
        id: u.id,
        product_id: u.product_id,
        material_id: u.material_id,
        packaging_style_id: u.packaging_style_id || null,
        quantity_per_unit: u.quantity_per_unit,
        product_name: u.product?.name || '未知',
        product_category: u.product?.category || '',
        packaging_name: null, // resolved below
      })))
    }

    if (prodRes.data) setProducts(prodRes.data)
    if (pkgRes.data) setPackagingStyles(pkgRes.data)
    setLoading(false)
  }, [asOfDate])

  useEffect(() => { fetchData() }, [fetchData])

  // Resolve packaging names after both usages and packagingStyles are loaded
  const resolvedUsages = usages.map(u => ({
    ...u,
    packaging_name: u.packaging_style_id
      ? packagingStyles.find((ps: any) => ps.id === u.packaging_style_id)?.name || null
      : null,
  }))

  // ─── Material handlers ────────────────────────

  const handleAddMaterial = async () => {
    if (!matName.trim()) return
    setSaving(true)
    await supabase.from('packaging_materials').insert({
      name: matName.trim(),
      unit: matUnit,
      safety_stock: parseInt(matSafety) || 100,
      lead_time_days: parseInt(matLeadTime) || 7,
    })
    setMatName(''); setMatUnit('個'); setMatSafety('100'); setMatLeadTime('7')
    setAddOpen(false)
    setSaving(false)
    fetchData()
  }

  const openEditDialog = (m: Material) => {
    setEditId(m.id); setEditName(m.name); setEditUnit(m.unit); setEditSafety(String(m.safety_stock)); setEditLeadTime(String(m.lead_time_days ?? 7))
    setEditOpen(true)
  }

  const handleEditMaterial = async () => {
    if (!editName.trim()) return
    setSaving(true)
    await supabase.from('packaging_materials').update({
      name: editName.trim(), unit: editUnit, safety_stock: parseInt(editSafety) || 0, lead_time_days: parseInt(editLeadTime) || 7,
    }).eq('id', editId)
    setEditOpen(false); setSaving(false); fetchData()
  }

  const handleDeleteMaterial = async (id: string, name: string) => {
    if (!confirm(`確定要刪除「${name}」？相關庫存記錄和用量對照也會一併刪除。`)) return
    await supabase.from('packaging_material_inventory').delete().eq('material_id', id)
    await supabase.from('product_material_usage').delete().eq('material_id', id)
    await supabase.from('packaging_materials').delete().eq('id', id)
    fetchData()
  }

  const handleToggleActive = async (id: string, isActive: boolean) => {
    await supabase.from('packaging_materials').update({ is_active: !isActive }).eq('id', id)
    fetchData()
  }

  // ─── Inbound handler ──────────────────────────

  const handleInbound = async () => {
    if (!inboundMat || !inboundQty) return
    setSaving(true)
    await supabase.from('packaging_material_inventory').insert({
      material_id: inboundMat, type: 'inbound',
      quantity: parseInt(inboundQty), reference_note: inboundNote || null,
    })
    setInboundMat(''); setInboundQty(''); setInboundNote('')
    setInboundOpen(false); setSaving(false); fetchData()
  }

  // ─── Usage mapping handlers ───────────────────

  const resetUsageForm = () => {
    setUsageCategory(''); setUsageProducts([]); setUsagePackaging('')
    setUsageMaterials([{ materialId: '', qty: '1' }])
  }

  const handleAddUsage = async () => {
    if (usageProducts.length === 0) return
    const validRows = usageMaterials.filter(m => m.materialId && parseFloat(m.qty) > 0)
    if (validRows.length === 0) return

    setSaving(true)
    const inserts = usageProducts.flatMap(productId =>
      validRows.map(m => ({
        product_id: productId,
        packaging_style_id: usagePackaging || null,
        material_id: m.materialId,
        quantity_per_unit: parseFloat(m.qty),
      }))
    )
    await supabase.from('product_material_usage').insert(inserts)
    resetUsageForm()
    setUsageOpen(false); setSaving(false); fetchData()
  }

  const handleDeleteUsage = async (id: string) => {
    await supabase.from('product_material_usage').delete().eq('id', id)
    fetchData()
  }

  const toggleProduct = (id: string) => {
    setUsageProducts(prev =>
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    )
  }

  const toggleAllProducts = () => {
    setUsageProducts(prev =>
      prev.length === filteredProducts.length ? [] : filteredProducts.map(p => p.id)
    )
  }

  const addMaterialRow = () => {
    setUsageMaterials(prev => [...prev, { materialId: '', qty: '1' }])
  }

  const removeMaterialRow = (index: number) => {
    setUsageMaterials(prev => prev.filter((_, i) => i !== index))
  }

  const updateMaterialRow = (index: number, field: 'materialId' | 'qty', value: string) => {
    setUsageMaterials(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }

  // ─── Derived data ─────────────────────────────

  const activeMaterials = materials.filter(m => m.is_active)
  const inactiveMaterials = materials.filter(m => !m.is_active)
  const lowStockCount = activeMaterials.filter(m => m.stock < m.safety_stock).length

  // Products filtered by selected category
  const filteredProducts = usageCategory
    ? products.filter(p => p.category === usageCategory)
    : []

  // Packaging styles filtered by selected category
  const filteredPackaging = usageCategory && PACKAGING_BY_CATEGORY[usageCategory]
    ? packagingStyles.filter((ps: any) => PACKAGING_BY_CATEGORY[usageCategory]?.includes(ps.name))
    : []

  const hasPackaging = usageCategory && PACKAGING_BY_CATEGORY[usageCategory]

  // Group usages by (product + packaging) for display
  const usageGroups: { key: string; productName: string; category: string; packagingName: string | null; items: typeof resolvedUsages }[] = []
  const groupMap = new Map<string, typeof resolvedUsages>()
  for (const u of resolvedUsages) {
    const key = `${u.product_id}__${u.packaging_style_id || 'none'}`
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(u)
  }
  for (const [key, items] of groupMap) {
    const first = items[0]
    const catLabel = CATEGORY_OPTIONS.find(c => c.value === first.product_category)?.label || first.product_category
    usageGroups.push({
      key,
      productName: first.product_name,
      category: catLabel,
      packagingName: first.packaging_name,
      items,
    })
  }

  const pkgName = (id: string) => packagingStyles.find((p: any) => p.id === id)?.name || '選擇'

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">包材庫存</h1>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
            {lowStockCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="mr-1 h-3 w-3" /> {lowStockCount} 項低庫存
              </Badge>
            )}
            {asOfDate !== format(new Date(), 'yyyy-MM-dd') && <Badge variant="outline" className="text-xs">歷史庫存</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-gray-400" />
              <Input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="h-8 w-36 text-sm" />
              {asOfDate !== format(new Date(), 'yyyy-MM-dd') && (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAsOfDate(format(new Date(), 'yyyy-MM-dd'))}>今天</Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => { resetUsageForm(); setUsageOpen(true) }}>
              <Settings className="mr-1 h-4 w-4" /> 用量對照
            </Button>
            <Button variant="outline" size="sm" onClick={() => setInboundOpen(true)}>
              <Package className="mr-1 h-4 w-4" /> 入庫
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> 新增包材
            </Button>
          </div>
        </div>
      </div>

      {/* ── Stock cards ── */}
      {activeMaterials.length === 0 && !loading ? (
        <Card className="mb-6">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 text-5xl">📦</div>
            <h2 className="mb-2 text-lg font-semibold text-gray-700">尚未設定包材品項</h2>
            <p className="mb-4 max-w-md text-sm text-gray-500">
              點擊右上角「新增包材」來新增包材品項，再透過「用量對照」設定每種產品消耗多少包材。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {activeMaterials.map(m => {
            const isLow = m.stock < m.safety_stock
            const pct = m.safety_stock > 0 ? Math.min(100, (m.stock / m.safety_stock) * 100) : 100
            return (
              <Card key={m.id}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{m.name}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] text-gray-500">D+{m.lead_time_days ?? 7}</Badge>
                      {isLow && <Badge variant="destructive" className="text-xs">低庫存</Badge>}
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-blue-600" onClick={() => openEditDialog(m)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-orange-600" onClick={() => handleToggleActive(m.id, m.is_active)} title="停用"><Ban className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-red-600" onClick={() => handleDeleteMaterial(m.id, m.name)} title="刪除"><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                  <div className={`mt-2 text-3xl font-bold ${isLow ? 'text-red-600' : ''}`}>
                    {m.stock.toLocaleString()}
                    <span className="ml-1 text-sm font-normal text-gray-500">{m.unit}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">安全庫存: {m.safety_stock.toLocaleString()}</div>
                  <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                    <div className={`h-2 rounded-full ${m.stock >= m.safety_stock ? 'bg-green-500' : m.stock > 0 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Usage mapping display (grouped) ── */}
      {usageGroups.length > 0 && (
        <Card className="mb-4">
          <CardHeader><CardTitle className="text-base">產品 → 包材用量對照</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {usageGroups.map(group => (
              <div key={group.key} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">{group.category}</Badge>
                  <span className="text-sm font-medium">{group.productName}</span>
                  {group.packagingName && (
                    <Badge variant="outline" className="text-xs">📦 {group.packagingName}</Badge>
                  )}
                </div>
                <div className="space-y-1">
                  {group.items.map(u => {
                    const mat = materials.find(m => m.id === u.material_id)
                    return (
                      <div key={u.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">• {mat?.name || '未知'}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">{u.quantity_per_unit} {mat?.unit || ''}</span>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-red-400 hover:text-red-600"
                            onClick={() => handleDeleteUsage(u.id)}>刪除</Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Inactive materials ── */}
      {inactiveMaterials.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm text-gray-400">已停用包材</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {inactiveMaterials.map(m => (
                <div key={m.id} className="flex items-center gap-1">
                  <Badge variant="outline" className="text-gray-400 line-through cursor-pointer" onClick={() => handleToggleActive(m.id, m.is_active)}>
                    {m.name} (點擊啟用)
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-gray-300 hover:text-red-500" onClick={() => handleDeleteMaterial(m.id, m.name)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Add Material Dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增包材品項</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>名稱 *</Label>
              <Input value={matName} onChange={e => setMatName(e.target.value)} placeholder="e.g. 蜂蜜蛋糕盒" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>單位</Label>
                <Select value={matUnit} onValueChange={v => v && setMatUnit(v)}>
                  <SelectTrigger><SelectValue>{matUnit}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="個">個</SelectItem>
                    <SelectItem value="張">張</SelectItem>
                    <SelectItem value="條">條</SelectItem>
                    <SelectItem value="捲">捲</SelectItem>
                    <SelectItem value="包">包</SelectItem>
                    <SelectItem value="箱">箱</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>安全庫存</Label>
                <Input type="number" min={0} value={matSafety} onChange={e => setMatSafety(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>到貨時間（天）</Label>
              <Input type="number" min={1} value={matLeadTime} onChange={e => setMatLeadTime(e.target.value)} placeholder="7" />
              <p className="mt-1 text-xs text-gray-400">叫貨後幾天到貨（D+?），用於判斷是否需發送叫貨通知</p>
            </div>
            <Button className="w-full" onClick={handleAddMaterial} disabled={saving || !matName.trim()}>
              {saving ? '儲存中...' : '新增包材'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Material Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>編輯包材品項</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>名稱 *</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>單位</Label>
                <Select value={editUnit} onValueChange={v => v && setEditUnit(v)}>
                  <SelectTrigger><SelectValue>{editUnit}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="個">個</SelectItem>
                    <SelectItem value="張">張</SelectItem>
                    <SelectItem value="條">條</SelectItem>
                    <SelectItem value="捲">捲</SelectItem>
                    <SelectItem value="包">包</SelectItem>
                    <SelectItem value="箱">箱</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>安全庫存</Label>
                <Input type="number" min={0} value={editSafety} onChange={e => setEditSafety(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>到貨時間（天）</Label>
              <Input type="number" min={1} value={editLeadTime} onChange={e => setEditLeadTime(e.target.value)} />
              <p className="mt-1 text-xs text-gray-400">叫貨後幾天到貨（D+?）</p>
            </div>
            <Button className="w-full" onClick={handleEditMaterial} disabled={saving || !editName.trim()}>
              {saving ? '儲存中...' : '儲存變更'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Inbound Dialog ── */}
      <Dialog open={inboundOpen} onOpenChange={setInboundOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>包材入庫</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>包材</Label>
              <Select value={inboundMat || undefined} onValueChange={v => v && setInboundMat(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇包材">{inboundMat ? activeMaterials.find(m => m.id === inboundMat)?.name : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {activeMaterials.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>入庫數量</Label>
              <Input type="number" min={1} value={inboundQty} onChange={e => setInboundQty(e.target.value)} placeholder="數量" />
            </div>
            <div>
              <Label>備註</Label>
              <Input value={inboundNote} onChange={e => setInboundNote(e.target.value)} placeholder="選填" />
            </div>
            <Button className="w-full" onClick={handleInbound} disabled={saving || !inboundMat || !inboundQty}>
              {saving ? '儲存中...' : '確認入庫'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Usage Mapping Dialog (redesigned) ── */}
      <Dialog open={usageOpen} onOpenChange={(open) => { if (!open) resetUsageForm(); setUsageOpen(open) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>設定用量對照</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">

            {/* Step 1: Category */}
            <div>
              <Label>產品類別</Label>
              <Select value={usageCategory || undefined} onValueChange={v => {
                if (v) { setUsageCategory(v); setUsageProducts([]); setUsagePackaging('') }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇類別">
                    {usageCategory ? CATEGORY_OPTIONS.find(c => c.value === usageCategory)?.label : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Products (multi-select) */}
            {usageCategory && filteredProducts.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>產品（可複選）</Label>
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={toggleAllProducts}>
                    {usageProducts.length === filteredProducts.length ? '取消全選' : '全選'}
                  </Button>
                </div>
                <div className="rounded-lg border p-2 max-h-48 overflow-y-auto space-y-0.5">
                  {filteredProducts.map(p => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={usageProducts.includes(p.id)}
                        onChange={() => toggleProduct(p.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm">{p.name}</span>
                    </label>
                  ))}
                </div>
                {usageProducts.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">已選 {usageProducts.length} / {filteredProducts.length} 項</p>
                )}
              </div>
            )}

            {/* Step 3: Packaging style (if applicable) */}
            {usageCategory && hasPackaging && filteredPackaging.length > 0 && (
              <div>
                <Label>包裝款式</Label>
                <Select value={usagePackaging || undefined} onValueChange={v => v && setUsagePackaging(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇包裝款式">
                      {usagePackaging ? pkgName(usagePackaging) : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {filteredPackaging.map((ps: any) => <SelectItem key={ps.id} value={ps.id}>{ps.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Step 4: Materials list */}
            {usageProducts.length > 0 && (
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">包材組成</Label>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addMaterialRow}>
                    <Plus className="mr-1 h-3 w-3" /> 新增包材
                  </Button>
                </div>
                {usageMaterials.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Select value={row.materialId || undefined} onValueChange={v => v && updateMaterialRow(idx, 'materialId', v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="選擇包材">
                            {row.materialId ? activeMaterials.find(m => m.id === row.materialId)?.name : undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {activeMaterials.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      type="number" min={0} step={0.1}
                      className="h-8 w-20 text-xs"
                      value={row.qty}
                      onChange={e => updateMaterialRow(idx, 'qty', e.target.value)}
                      placeholder="數量"
                    />
                    {usageMaterials.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => removeMaterialRow(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button className="w-full" onClick={handleAddUsage}
              disabled={saving || usageProducts.length === 0 || usageMaterials.every(m => !m.materialId)}>
              {saving ? '儲存中...' : '儲存對照'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
