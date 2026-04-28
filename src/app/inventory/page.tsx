'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useCurrentUserClient } from '@/lib/auth'
import { format, addDays } from 'date-fns'
import {
  Loader2, Plus, Send, Pencil, Check, X, Package, AlertTriangle,
  Trash2, Ban, Eye, EyeOff,
} from 'lucide-react'
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

interface ProductStock {
  id: string
  name: string
  category: string
  stock: number
  safety_stock: number
  lead_time_days: number
  show_in_inventory: boolean
}

interface MaterialStock {
  id: string
  name: string
  unit: string
  safety_stock: number
  lead_time_days: number
  is_active: boolean
  stock: number
}

const leadDateStr = (days: number) => format(addDays(new Date(), days), 'yyyy-MM-dd')

export default function InventoryPage() {
  const supabase = createClient()
  const { user } = useCurrentUserClient()
  const isAdmin = !!user?.is_admin
  const [products, setProducts] = useState<ProductStock[]>([])
  const [materials, setMaterials] = useState<MaterialStock[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Inbound dialogs
  const [productInboundOpen, setProductInboundOpen] = useState(false)
  const [pInboundProduct, setPInboundProduct] = useState('')
  const [pInboundQty, setPInboundQty] = useState('')
  const [pInboundNote, setPInboundNote] = useState('')

  const [materialInboundOpen, setMaterialInboundOpen] = useState(false)
  const [mInboundMat, setMInboundMat] = useState('')
  const [mInboundQty, setMInboundQty] = useState('')
  const [mInboundNote, setMInboundNote] = useState('')

  // Material add/edit dialogs
  const [matAddOpen, setMatAddOpen] = useState(false)
  const [matName, setMatName] = useState('')
  const [matUnit, setMatUnit] = useState('個')
  const [matSafety, setMatSafety] = useState('100')
  const [matLeadTime, setMatLeadTime] = useState('7')

  const [matEditOpen, setMatEditOpen] = useState(false)
  const [matEditId, setMatEditId] = useState('')
  const [matEditName, setMatEditName] = useState('')
  const [matEditUnit, setMatEditUnit] = useState('')
  const [matEditSafety, setMatEditSafety] = useState('')
  const [matEditLeadTime, setMatEditLeadTime] = useState('7')

  // Inline edit (per-product safety / leadTime)
  const [editingSafetyId, setEditingSafetyId] = useState<string | null>(null)
  const [editingSafetyValue, setEditingSafetyValue] = useState('')
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null)
  const [editingLeadValue, setEditingLeadValue] = useState('')

  // LINE notify
  const [sendingLine, setSendingLine] = useState(false)
  const [lineMessage, setLineMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  // ─── Fetch ─────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)

    const [prodsRes, matRes] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, category, sort_order, safety_stock, lead_time_days, show_in_inventory')
        .eq('is_active', true)
        .in('category', ['cake_bar', 'tube_pkg', 'cookie'])
        .order('sort_order'),
      supabase.from('packaging_materials').select('*').order('name'),
    ])

    // Compute per-product stock at each product's leadDate
    type ProductRow = Omit<ProductStock, 'stock'>
    const prodList = (prodsRes.data ?? []) as unknown as ProductRow[]
    const maxProductLead = prodList.length > 0
      ? Math.max(...prodList.map(p => p.lead_time_days ?? 15))
      : 15
    const productMaxDate = leadDateStr(maxProductLead)
    const productIds = prodList.map(p => p.id)

    const { data: invData } = productIds.length > 0
      ? await supabase
          .from('inventory')
          .select('product_id, quantity, date')
          .lte('date', productMaxDate)
          .in('product_id', productIds)
      : { data: [] as { product_id: string; quantity: number; date: string }[] }

    const productsWithStock: ProductStock[] = prodList.map(p => {
      const lead = p.lead_time_days ?? 15
      const dateLimit = leadDateStr(lead)
      const stock = (invData ?? [])
        .filter(r => r.product_id === p.id && r.date <= dateLimit)
        .reduce((sum, r) => sum + r.quantity, 0)
      return { ...p, stock }
    })
    setProducts(productsWithStock)

    // Compute per-material stock at each material's leadDate
    type MaterialRow = Omit<MaterialStock, 'stock'>
    const matList = (matRes.data ?? []) as unknown as MaterialRow[]
    const maxMaterialLead = matList.length > 0
      ? Math.max(...matList.map(m => m.lead_time_days ?? 7))
      : 7
    const materialMaxDate = leadDateStr(maxMaterialLead)
    const materialIds = matList.map(m => m.id)

    const { data: matInvData } = materialIds.length > 0
      ? await supabase
          .from('packaging_material_inventory')
          .select('material_id, quantity, date')
          .lte('date', materialMaxDate)
          .in('material_id', materialIds)
      : { data: [] as { material_id: string; quantity: number; date: string }[] }

    const materialsWithStock: MaterialStock[] = matList.map(m => {
      const lead = m.lead_time_days ?? 7
      const dateLimit = leadDateStr(lead)
      const stock = (matInvData ?? [])
        .filter(r => r.material_id === m.id && r.date <= dateLimit)
        .reduce((sum, r) => sum + r.quantity, 0)
      return { ...m, stock }
    })
    setMaterials(materialsWithStock)

    setLoading(false)
  }, [])

  const fetchRef = useRef(fetchAll)
  useEffect(() => { fetchRef.current = fetchAll }, [fetchAll])
  useEffect(() => { fetchAll() }, [fetchAll])

  useEffect(() => {
    const channel = supabase
      .channel('inventory-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => fetchRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packaging_material_inventory' }, () => fetchRef.current())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (!lineMessage) return
    const timer = setTimeout(() => setLineMessage(null), 5000)
    return () => clearTimeout(timer)
  }, [lineMessage])

  // ─── Inline edit handlers ──────────────────────

  const startEditSafety = (p: ProductStock) => {
    if (!isAdmin) return
    setEditingSafetyId(p.id)
    setEditingSafetyValue(String(p.safety_stock))
  }
  const cancelEditSafety = () => { setEditingSafetyId(null); setEditingSafetyValue('') }
  const saveEditSafety = async () => {
    if (!isAdmin) return
    if (!editingSafetyId) return
    const value = parseInt(editingSafetyValue, 10)
    if (Number.isNaN(value) || value < 0) { cancelEditSafety(); return }
    const id = editingSafetyId
    setProducts(prev => prev.map(p => p.id === id ? { ...p, safety_stock: value } : p))
    cancelEditSafety()
    const { error } = await supabase.from('products').update({ safety_stock: value }).eq('id', id)
    if (error) { alert(`儲存安全庫存失敗：${error.message}`); fetchAll() }
  }

  const startEditLead = (p: ProductStock) => {
    if (!isAdmin) return
    setEditingLeadId(p.id)
    setEditingLeadValue(String(p.lead_time_days))
  }
  const cancelEditLead = () => { setEditingLeadId(null); setEditingLeadValue('') }
  const saveEditLead = async () => {
    if (!isAdmin) return
    if (!editingLeadId) return
    const value = parseInt(editingLeadValue, 10)
    if (Number.isNaN(value) || value < 0) { cancelEditLead(); return }
    const id = editingLeadId
    cancelEditLead()
    const { error } = await supabase.from('products').update({ lead_time_days: value }).eq('id', id)
    if (error) alert(`儲存到貨時間失敗：${error.message}`)
    fetchAll()
  }

  // ─── Inbound handlers ──────────────────────────

  const handleProductInbound = async () => {
    if (!isAdmin) return
    if (!pInboundProduct || !pInboundQty) return
    setSaving(true)
    await supabase.from('inventory').insert({
      product_id: pInboundProduct,
      type: 'inbound',
      quantity: parseInt(pInboundQty),
      reference_note: pInboundNote || null,
    })
    setPInboundProduct(''); setPInboundQty(''); setPInboundNote('')
    setProductInboundOpen(false); setSaving(false); fetchAll()
  }

  const handleMaterialInbound = async () => {
    if (!isAdmin) return
    if (!mInboundMat || !mInboundQty) return
    setSaving(true)
    await supabase.from('packaging_material_inventory').insert({
      material_id: mInboundMat, type: 'inbound',
      quantity: parseInt(mInboundQty), reference_note: mInboundNote || null,
    })
    setMInboundMat(''); setMInboundQty(''); setMInboundNote('')
    setMaterialInboundOpen(false); setSaving(false); fetchAll()
  }

  // ─── Material handlers ────────────────────────

  const handleAddMaterial = async () => {
    if (!isAdmin) return
    if (!matName.trim()) return
    setSaving(true)
    await supabase.from('packaging_materials').insert({
      name: matName.trim(),
      unit: matUnit,
      safety_stock: parseInt(matSafety) || 100,
      lead_time_days: parseInt(matLeadTime) || 7,
    })
    setMatName(''); setMatUnit('個'); setMatSafety('100'); setMatLeadTime('7')
    setMatAddOpen(false); setSaving(false); fetchAll()
  }

  const openMatEditDialog = (m: MaterialStock) => {
    if (!isAdmin) return
    setMatEditId(m.id)
    setMatEditName(m.name)
    setMatEditUnit(m.unit)
    setMatEditSafety(String(m.safety_stock))
    setMatEditLeadTime(String(m.lead_time_days ?? 7))
    setMatEditOpen(true)
  }

  const handleEditMaterial = async () => {
    if (!isAdmin) return
    if (!matEditName.trim()) return
    setSaving(true)
    await supabase.from('packaging_materials').update({
      name: matEditName.trim(),
      unit: matEditUnit,
      safety_stock: parseInt(matEditSafety) || 0,
      lead_time_days: parseInt(matEditLeadTime) || 7,
    }).eq('id', matEditId)
    setMatEditOpen(false); setSaving(false); fetchAll()
  }

  const handleDeleteMaterial = async (id: string, name: string) => {
    if (!isAdmin) return
    if (!confirm(`確定要刪除「${name}」？相關庫存記錄和用量對照也會一併刪除。`)) return
    await supabase.from('packaging_material_inventory').delete().eq('material_id', id)
    await supabase.from('product_material_usage').delete().eq('material_id', id)
    await supabase.from('packaging_materials').delete().eq('id', id)
    fetchAll()
  }

  const handleToggleMatActive = async (id: string, isActive: boolean) => {
    if (!isAdmin) return
    await supabase.from('packaging_materials').update({ is_active: !isActive }).eq('id', id)
    fetchAll()
  }

  // ─── LINE notify ───────────────────────────────

  const handleLineNotify = async () => {
    if (!isAdmin) return
    setSendingLine(true)
    try {
      const res = await fetch('/api/line-notify')
      const data = await res.json()
      if (res.ok) {
        if (data.notified?.products === 0 && data.notified?.materials === 0) {
          setLineMessage({ type: 'info', text: '所有庫存充足，無需叫貨' })
        } else {
          setLineMessage({ type: 'success', text: `已發送叫貨通知（產品 ${data.notified?.products ?? 0} 項、包材 ${data.notified?.materials ?? 0} 項）` })
        }
      } else {
        setLineMessage({ type: 'error', text: data.error || '發送失敗' })
      }
    } catch {
      setLineMessage({ type: 'error', text: '網路錯誤，請稍後再試' })
    }
    setSendingLine(false)
  }

  // ─── Cookie visibility toggle ─────────────────

  const cookies = products.filter(p => p.category === 'cookie')
  const cookiesHidden = cookies.length > 0 && cookies.every(c => !c.show_in_inventory)

  const toggleCookiesVisible = async () => {
    if (!isAdmin) return
    const newValue = cookiesHidden
    const ids = cookies.map(c => c.id)
    if (ids.length === 0) return
    setProducts(prev => prev.map(p => ids.includes(p.id) ? { ...p, show_in_inventory: newValue } : p))
    const { error } = await supabase
      .from('products')
      .update({ show_in_inventory: newValue })
      .in('id', ids)
    if (error) { alert(`切換顯示失敗：${error.message}`); fetchAll() }
  }

  // ─── Derived ──────────────────────────────────

  const cakeBars = products.filter(p => p.category === 'cake_bar')
  const tubePkgs = products.filter(p => p.category === 'tube_pkg')
  const activeMaterials = materials.filter(m => m.is_active)
  const inactiveMaterials = materials.filter(m => !m.is_active)
  const lowMatCount = activeMaterials.filter(m => m.stock < m.safety_stock).length

  // ─── Render ───────────────────────────────────

  const renderProductCard = (p: ProductStock) => {
    const isLow = p.stock < p.safety_stock
    const isEditingSafety = editingSafetyId === p.id
    const isEditingLead = editingLeadId === p.id
    return (
      <Card key={p.id}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium break-words">{p.name}</span>
            <div className="flex items-center gap-1">
              {isEditingLead ? (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-500">D+</span>
                  <Input
                    type="number"
                    min={1}
                    value={editingLeadValue}
                    onChange={e => setEditingLeadValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEditLead()
                      if (e.key === 'Escape') cancelEditLead()
                    }}
                    autoFocus
                    className="h-6 w-12 px-1 text-xs"
                  />
                  <button onClick={saveEditLead} className="text-green-600 hover:text-green-800" aria-label="儲存到貨時間">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={cancelEditLead} className="text-gray-400 hover:text-gray-600" aria-label="取消">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : isAdmin ? (
                <button
                  onClick={() => startEditLead(p)}
                  className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-blue-50 hover:text-blue-700"
                  title="點擊編輯到貨時間"
                >
                  D+{p.lead_time_days}
                </button>
              ) : (
                <span className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-600">
                  D+{p.lead_time_days}
                </span>
              )}
              {isLow && <Badge variant="destructive" className="text-xs">低庫存</Badge>}
            </div>
          </div>
          <div className={`mt-2 text-3xl font-bold ${isLow ? 'text-red-600' : ''}`}>
            {p.stock.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <span>安全庫存:</span>
            {isEditingSafety ? (
              <>
                <Input
                  type="number"
                  min={0}
                  value={editingSafetyValue}
                  onChange={e => setEditingSafetyValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveEditSafety()
                    if (e.key === 'Escape') cancelEditSafety()
                  }}
                  autoFocus
                  className="h-6 w-20 px-1 text-xs"
                />
                <button onClick={saveEditSafety} className="text-green-600 hover:text-green-800" aria-label="儲存"><Check className="h-3.5 w-3.5" /></button>
                <button onClick={cancelEditSafety} className="text-gray-400 hover:text-gray-600" aria-label="取消"><X className="h-3.5 w-3.5" /></button>
              </>
            ) : (
              <>
                <span>{p.safety_stock.toLocaleString()}</span>
                {isAdmin && (
                  <button onClick={() => startEditSafety(p)} className="ml-1 text-gray-400 hover:text-blue-600" aria-label="編輯安全庫存">
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </>
            )}
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full ${p.stock >= p.safety_stock ? 'bg-green-500' : p.stock > 0 ? 'bg-orange-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(100, (p.stock / Math.max(p.safety_stock, 1)) * 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderMaterialCard = (m: MaterialStock) => {
    const isLow = m.stock < m.safety_stock
    const pct = m.safety_stock > 0 ? Math.min(100, (m.stock / m.safety_stock) * 100) : 100
    return (
      <Card key={m.id}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <span className="font-medium break-words">{m.name}</span>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[10px] text-gray-500">D+{m.lead_time_days ?? 7}</Badge>
              {isLow && <Badge variant="destructive" className="text-xs">低庫存</Badge>}
              {isAdmin && (
                <>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-blue-600" onClick={() => openMatEditDialog(m)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-orange-600" onClick={() => handleToggleMatActive(m.id, m.is_active)} title="停用">
                    <Ban className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-red-600" onClick={() => handleDeleteMaterial(m.id, m.name)} title="刪除">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
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
  }

  return (
    <div>
      {lineMessage && (
        <div className={`mb-4 rounded-lg border p-3 text-sm ${
          lineMessage.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' :
          lineMessage.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' :
          'border-blue-200 bg-blue-50 text-blue-800'
        }`}>
          <div className="flex items-center justify-between">
            <span>{lineMessage.text}</span>
            <button onClick={() => setLineMessage(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">庫存總覽</h1>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          {lowMatCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="mr-1 h-3 w-3" /> {lowMatCount} 項包材低庫存
            </Badge>
          )}
          <span className="text-xs text-gray-500">每項依各自到貨時間 D+N 計算未來庫存</span>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLineNotify}
              disabled={sendingLine || loading}
              className="h-8 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              {sendingLine ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
              叫貨通知
            </Button>
            <Button variant="outline" size="sm" onClick={() => setProductInboundOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> 產品入庫
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMaterialInboundOpen(true)}>
              <Package className="mr-1 h-4 w-4" /> 包材入庫
            </Button>
            <Button size="sm" onClick={() => setMatAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> 新增包材
            </Button>
          </div>
        )}
      </div>

      {cakeBars.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">蜂蜜蛋糕（條）</h2>
          <div className="grid gap-3 sm:grid-cols-3">{cakeBars.map(renderProductCard)}</div>
        </div>
      )}

      {tubePkgs.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">旋轉筒包裝</h2>
          <div className="grid gap-3 sm:grid-cols-3">{tubePkgs.map(renderProductCard)}</div>
        </div>
      )}

      {cookies.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              曲奇
              {cookiesHidden && <span className="ml-2 text-xs font-normal text-gray-400">（已隱藏，不列入叫貨通知）</span>}
            </h2>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={toggleCookiesVisible}
                className="h-7 text-xs"
              >
                {cookiesHidden ? <><Eye className="mr-1 h-3 w-3" /> 顯示</> : <><EyeOff className="mr-1 h-3 w-3" /> 隱藏</>}
              </Button>
            )}
          </div>
          {!cookiesHidden && (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{cookies.map(renderProductCard)}</div>
          )}
        </div>
      )}

      {(activeMaterials.length > 0 || !loading) && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">包材</h2>
          {activeMaterials.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-2 text-3xl">📦</div>
                <p className="text-sm text-gray-500">尚未設定包材，點擊右上角「新增包材」開始</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activeMaterials.map(renderMaterialCard)}
            </div>
          )}
        </div>
      )}

      {isAdmin && inactiveMaterials.length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm text-gray-400">已停用包材</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {inactiveMaterials.map(m => (
                <div key={m.id} className="flex items-center gap-1">
                  <Badge variant="outline" className="text-gray-400 line-through cursor-pointer" onClick={() => handleToggleMatActive(m.id, m.is_active)}>
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

      {/* ── Product Inbound Dialog ── */}
      <Dialog open={productInboundOpen} onOpenChange={setProductInboundOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>產品入庫</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>產品</Label>
              <Select value={pInboundProduct || undefined} onValueChange={(v) => v && setPInboundProduct(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇產品">
                    {pInboundProduct ? products.find(p => p.id === pInboundProduct)?.name : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>入庫數量</Label>
              <Input type="number" min={1} value={pInboundQty} onChange={e => setPInboundQty(e.target.value)} placeholder="數量" />
            </div>
            <div>
              <Label>備註</Label>
              <Input value={pInboundNote} onChange={e => setPInboundNote(e.target.value)} placeholder="選填" />
            </div>
            <Button className="w-full" onClick={handleProductInbound} disabled={saving || !pInboundProduct || !pInboundQty}>
              {saving ? '儲存中...' : '確認入庫'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Material Inbound Dialog ── */}
      <Dialog open={materialInboundOpen} onOpenChange={setMaterialInboundOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>包材入庫</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>包材</Label>
              <Select value={mInboundMat || undefined} onValueChange={v => v && setMInboundMat(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇包材">{mInboundMat ? activeMaterials.find(m => m.id === mInboundMat)?.name : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {activeMaterials.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>入庫數量</Label>
              <Input type="number" min={1} value={mInboundQty} onChange={e => setMInboundQty(e.target.value)} placeholder="數量" />
            </div>
            <div>
              <Label>備註</Label>
              <Input value={mInboundNote} onChange={e => setMInboundNote(e.target.value)} placeholder="選填" />
            </div>
            <Button className="w-full" onClick={handleMaterialInbound} disabled={saving || !mInboundMat || !mInboundQty}>
              {saving ? '儲存中...' : '確認入庫'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Add Material Dialog ── */}
      <Dialog open={matAddOpen} onOpenChange={setMatAddOpen}>
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
      <Dialog open={matEditOpen} onOpenChange={setMatEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>編輯包材品項</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>名稱 *</Label>
              <Input value={matEditName} onChange={e => setMatEditName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>單位</Label>
                <Select value={matEditUnit} onValueChange={v => v && setMatEditUnit(v)}>
                  <SelectTrigger><SelectValue>{matEditUnit}</SelectValue></SelectTrigger>
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
                <Input type="number" min={0} value={matEditSafety} onChange={e => setMatEditSafety(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>到貨時間（天）</Label>
              <Input type="number" min={1} value={matEditLeadTime} onChange={e => setMatEditLeadTime(e.target.value)} />
              <p className="mt-1 text-xs text-gray-400">叫貨後幾天到貨（D+?）</p>
            </div>
            <Button className="w-full" onClick={handleEditMaterial} disabled={saving || !matEditName.trim()}>
              {saving ? '儲存中...' : '儲存變更'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
