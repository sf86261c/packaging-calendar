'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useCurrentUserClient } from '@/lib/auth'
import { logActivity } from '@/lib/activity'
import { format, addDays } from 'date-fns'
import {
  Loader2, Plus, Send, Pencil, Check, X, Package, AlertTriangle,
  Trash2, Ban, Eye, EyeOff, Edit3, FolderPlus, Folder, GripVertical,
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
  category_id: string | null
  sort_order: number
  stock: number
}

interface MaterialCategoryRow {
  id: string
  name: string
  sort_order: number
}

type AdjustKind = 'product' | 'material'
interface AdjustTarget {
  kind: AdjustKind
  id: string
  name: string
  unit?: string
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
  const [matCategory, setMatCategory] = useState<string>('')

  const [matEditOpen, setMatEditOpen] = useState(false)
  const [matEditId, setMatEditId] = useState('')
  const [matEditName, setMatEditName] = useState('')
  const [matEditUnit, setMatEditUnit] = useState('')
  const [matEditSafety, setMatEditSafety] = useState('')
  const [matEditLeadTime, setMatEditLeadTime] = useState('7')
  const [matEditCategory, setMatEditCategory] = useState<string>('')

  // Material categories
  const [categories, setCategories] = useState<MaterialCategoryRow[]>([])
  const [catAddOpen, setCatAddOpen] = useState(false)
  const [catName, setCatName] = useState('')
  const [catEditOpen, setCatEditOpen] = useState(false)
  const [catEditId, setCatEditId] = useState('')
  const [catEditName, setCatEditName] = useState('')

  // Adjust actual stock dialog
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<AdjustTarget | null>(null)
  const [adjustCurrentActual, setAdjustCurrentActual] = useState<number>(0)
  const [adjustNewValue, setAdjustNewValue] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjustLoading, setAdjustLoading] = useState(false)

  // Inline edit (per-product safety / leadTime)
  const [editingSafetyId, setEditingSafetyId] = useState<string | null>(null)
  const [editingSafetyValue, setEditingSafetyValue] = useState('')
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null)
  const [editingLeadValue, setEditingLeadValue] = useState('')

  // LINE notify
  const [sendingLine, setSendingLine] = useState(false)
  const [lineMessage, setLineMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  // Drag-and-drop reorder
  type DragScope =
    | { kind: 'product'; category: 'cake_bar' | 'cookie' }
    | { kind: 'material'; categoryId: string | null }
  const [dragging, setDragging] = useState<{ scope: DragScope; id: string } | null>(null)
  const scopeKey = (s: DragScope) => s.kind === 'product' ? `p:${s.category}` : `m:${s.categoryId ?? 'none'}`
  const sameScope = (a: DragScope, b: DragScope) => scopeKey(a) === scopeKey(b)

  // ─── Fetch ─────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true)

    const [prodsRes, matRes, catRes] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, category, sort_order, safety_stock, lead_time_days, show_in_inventory')
        .eq('is_active', true)
        .in('category', ['cake_bar', 'cookie'])
        .order('sort_order'),
      supabase.from('packaging_materials').select('*').order('sort_order').order('name'),
      supabase
        .from('packaging_material_categories')
        .select('id, name, sort_order')
        .order('sort_order')
        .order('name'),
    ])

    setCategories((catRes.data ?? []) as MaterialCategoryRow[])

    // Compute per-product stock at each product's leadDate
    type ProductRow = Omit<ProductStock, 'stock'>
    const prodList = (prodsRes.data ?? []) as unknown as ProductRow[]
    const maxProductLead = prodList.length > 0
      ? Math.max(...prodList.map(p => p.lead_time_days ?? 15))
      : 15
    const productMaxDate = leadDateStr(maxProductLead)
    const productIds = prodList.map(p => p.id)

    // Supabase 預設 max-rows=1000，超過會被截斷 → 必須分頁累加
    type InvRow = { product_id: string; quantity: number; date: string }
    const invData: InvRow[] = []
    if (productIds.length > 0) {
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data } = await supabase
          .from('inventory')
          .select('product_id, quantity, date')
          .lte('date', productMaxDate)
          .in('product_id', productIds)
          .range(from, from + PAGE - 1)
        const rows = (data ?? []) as InvRow[]
        invData.push(...rows)
        if (rows.length < PAGE) break
        from += PAGE
      }
    }

    const productsWithStock: ProductStock[] = prodList.map(p => {
      const lead = p.lead_time_days ?? 15
      const dateLimit = leadDateStr(lead)
      const stock = invData
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

    type MatInvRow = { material_id: string; quantity: number; date: string }
    const matInvData: MatInvRow[] = []
    if (materialIds.length > 0) {
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data } = await supabase
          .from('packaging_material_inventory')
          .select('material_id, quantity, date')
          .lte('date', materialMaxDate)
          .in('material_id', materialIds)
          .range(from, from + PAGE - 1)
        const rows = (data ?? []) as MatInvRow[]
        matInvData.push(...rows)
        if (rows.length < PAGE) break
        from += PAGE
      }
    }

    const materialsWithStock: MaterialStock[] = matList.map(m => {
      const lead = m.lead_time_days ?? 7
      const dateLimit = leadDateStr(lead)
      const stock = matInvData
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packaging_material_categories' }, () => fetchRef.current())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'packaging_materials' }, () => fetchRef.current())
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
      category_id: matCategory || null,
    })
    setMatName(''); setMatUnit('個'); setMatSafety('100'); setMatLeadTime('7')
    setMatCategory('')
    setMatAddOpen(false); setSaving(false); fetchAll()
  }

  const openMatEditDialog = (m: MaterialStock) => {
    if (!isAdmin) return
    setMatEditId(m.id)
    setMatEditName(m.name)
    setMatEditUnit(m.unit)
    setMatEditSafety(String(m.safety_stock))
    setMatEditLeadTime(String(m.lead_time_days ?? 7))
    setMatEditCategory(m.category_id ?? '')
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
      category_id: matEditCategory || null,
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

  // ─── Material category CRUD ───────────────────

  const handleAddCategory = async () => {
    if (!isAdmin) return
    const name = catName.trim()
    if (!name) return
    setSaving(true)
    const nextOrder = categories.length > 0
      ? Math.max(...categories.map(c => c.sort_order ?? 0)) + 10
      : 10
    const { error } = await supabase.from('packaging_material_categories').insert({
      name, sort_order: nextOrder,
    })
    setSaving(false)
    if (error) { alert(`新增分類失敗：${error.message}`); return }
    await logActivity('新增包材分類', null, { 名稱: name })
    setCatName(''); setCatAddOpen(false); fetchAll()
  }

  const openCatEdit = (cat: MaterialCategoryRow) => {
    if (!isAdmin) return
    setCatEditId(cat.id)
    setCatEditName(cat.name)
    setCatEditOpen(true)
  }

  const handleEditCategory = async () => {
    if (!isAdmin) return
    const name = catEditName.trim()
    if (!name || !catEditId) return
    setSaving(true)
    const { error } = await supabase
      .from('packaging_material_categories')
      .update({ name })
      .eq('id', catEditId)
    setSaving(false)
    if (error) { alert(`重新命名失敗：${error.message}`); return }
    await logActivity('編輯包材分類', `category:${catEditId}`, { 名稱: name })
    setCatEditOpen(false); fetchAll()
  }

  const handleDeleteCategory = async (cat: MaterialCategoryRow) => {
    if (!isAdmin) return
    const count = materials.filter(m => m.category_id === cat.id).length
    const msg = count > 0
      ? `確定刪除分類「${cat.name}」？該分類下 ${count} 項包材會變成「未分類」（包材本身不會被刪除）。`
      : `確定刪除分類「${cat.name}」？`
    if (!confirm(msg)) return
    const { error } = await supabase
      .from('packaging_material_categories')
      .delete()
      .eq('id', cat.id)
    if (error) { alert(`刪除分類失敗：${error.message}`); return }
    await logActivity('刪除包材分類', `category:${cat.id}`, { 名稱: cat.name })
    fetchAll()
  }

  // ─── Adjust actual stock (修正誤差) ────────────

  const fetchActualStock = async (kind: AdjustKind, id: string): Promise<number> => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const table = kind === 'product' ? 'inventory' : 'packaging_material_inventory'
    const idCol = kind === 'product' ? 'product_id' : 'material_id'
    // 分頁累加避免單一品項紀錄超過 1000 筆被截斷
    let total = 0
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data } = await supabase
        .from(table)
        .select('quantity')
        .eq(idCol, id)
        .lte('date', today)
        .range(from, from + PAGE - 1)
      const rows = (data ?? []) as { quantity: number }[]
      total += rows.reduce((sum, r) => sum + (r.quantity ?? 0), 0)
      if (rows.length < PAGE) break
      from += PAGE
    }
    return total
  }

  const openAdjustDialog = async (target: AdjustTarget) => {
    if (!isAdmin) return
    setAdjustTarget(target)
    setAdjustNote('')
    setAdjustOpen(true)
    setAdjustLoading(true)
    const actual = await fetchActualStock(target.kind, target.id)
    setAdjustCurrentActual(actual)
    setAdjustNewValue(String(actual))
    setAdjustLoading(false)
  }

  const handleAdjustSubmit = async () => {
    if (!isAdmin || !adjustTarget) return
    const newVal = parseInt(adjustNewValue, 10)
    if (Number.isNaN(newVal) || newVal < 0) {
      alert('請輸入有效的非負整數')
      return
    }
    const diff = newVal - adjustCurrentActual
    if (diff === 0) { setAdjustOpen(false); return }

    setAdjustLoading(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const note = adjustNote.trim()
    const referenceNote = `manual_adjust:${note || '修正實際數量'}`

    if (adjustTarget.kind === 'product') {
      const { error } = await supabase.from('inventory').insert({
        product_id: adjustTarget.id,
        date: today,
        type: 'adjustment',
        quantity: diff,
        reference_note: referenceNote,
      })
      if (error) {
        alert(`修正失敗：${error.message}`)
        setAdjustLoading(false)
        return
      }
    } else {
      const { error } = await supabase.from('packaging_material_inventory').insert({
        material_id: adjustTarget.id,
        date: today,
        type: 'adjustment',
        quantity: diff,
        reference_note: referenceNote,
      })
      if (error) {
        alert(`修正失敗：${error.message}`)
        setAdjustLoading(false)
        return
      }
    }

    await logActivity('修正實際庫存', `${adjustTarget.kind}:${adjustTarget.id}`, {
      類型: adjustTarget.kind === 'product' ? '產品' : '包材',
      名稱: adjustTarget.name,
      原實際數量: adjustCurrentActual,
      新實際數量: newVal,
      差額: diff,
      備註: note || null,
    })

    setAdjustLoading(false)
    setAdjustOpen(false)
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

  // ─── Drag-and-drop reorder ────────────────────

  const handleReorderProducts = async (orderedIds: string[]) => {
    if (!isAdmin || orderedIds.length < 2) return
    // 樂觀 update：先動 UI 再寫 DB
    setProducts(prev => {
      const idToSort: Record<string, number> = {}
      orderedIds.forEach((id, i) => { idToSort[id] = (i + 1) * 10 })
      return prev.map(p => p.id in idToSort ? { ...p, sort_order: idToSort[p.id] } : p)
    })
    const updates = orderedIds.map((id, i) =>
      supabase.from('products').update({ sort_order: (i + 1) * 10 }).eq('id', id),
    )
    const results = await Promise.all(updates)
    const err = results.find(r => r.error)
    if (err?.error) { alert(`更新排序失敗：${err.error.message}`); fetchAll() }
  }

  const handleReorderMaterials = async (orderedIds: string[]) => {
    if (!isAdmin || orderedIds.length < 2) return
    setMaterials(prev => {
      const idToSort: Record<string, number> = {}
      orderedIds.forEach((id, i) => { idToSort[id] = (i + 1) * 10 })
      return prev.map(m => m.id in idToSort ? { ...m, sort_order: idToSort[m.id] } : m)
    })
    const updates = orderedIds.map((id, i) =>
      supabase.from('packaging_materials').update({ sort_order: (i + 1) * 10 }).eq('id', id),
    )
    const results = await Promise.all(updates)
    const err = results.find(r => r.error)
    if (err?.error) { alert(`更新排序失敗：${err.error.message}`); fetchAll() }
  }

  const handleCardDrop = (
    scope: DragScope,
    listIds: string[],
    droppedOnId: string,
  ) => {
    if (!dragging) return
    if (!sameScope(dragging.scope, scope)) return
    if (dragging.id === droppedOnId) { setDragging(null); return }
    const fromIdx = listIds.indexOf(dragging.id)
    const toIdx = listIds.indexOf(droppedOnId)
    if (fromIdx < 0 || toIdx < 0) { setDragging(null); return }
    const reordered = [...listIds]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setDragging(null)
    if (scope.kind === 'product') handleReorderProducts(reordered)
    else handleReorderMaterials(reordered)
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
  const activeMaterials = materials.filter(m => m.is_active)
  const inactiveMaterials = materials.filter(m => !m.is_active)
  const lowMatCount = activeMaterials.filter(m => m.stock < m.safety_stock).length

  // ─── Render ───────────────────────────────────

  const renderProductCard = (p: ProductStock, scope: DragScope, listIds: string[]) => {
    const isLow = p.stock < p.safety_stock
    const isEditingSafety = editingSafetyId === p.id
    const isEditingLead = editingLeadId === p.id
    const isDraggingThis = dragging?.id === p.id
    const canDrop = !!dragging && sameScope(dragging.scope, scope) && dragging.id !== p.id
    return (
      <Card
        key={p.id}
        draggable={isAdmin}
        onDragStart={(e) => {
          if (!isAdmin) return
          setDragging({ scope, id: p.id })
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => setDragging(null)}
        onDragOver={(e) => {
          if (canDrop) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }
        }}
        onDrop={(e) => {
          if (canDrop) {
            e.preventDefault()
            handleCardDrop(scope, listIds, p.id)
          }
        }}
        className={`${isDraggingThis ? 'opacity-40' : ''} ${canDrop ? 'ring-2 ring-blue-400 ring-offset-1' : ''} transition-all`}
      >
        <CardContent className="pt-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 min-w-0">
              {isAdmin && (
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-300 hover:text-gray-500" aria-label="拖拉排序" />
              )}
              <span className="font-medium break-words">{p.name}</span>
            </div>
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
          <div className="mt-2 flex items-baseline gap-2">
            <div className={`text-3xl font-bold ${isLow ? 'text-red-600' : ''}`}>
              {p.stock.toLocaleString()}
            </div>
            {isAdmin && (
              <button
                onClick={() => openAdjustDialog({ kind: 'product', id: p.id, name: p.name })}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-600 hover:bg-blue-50 hover:text-blue-700"
                title="修正實際數量（誤差校正）"
              >
                <Edit3 className="h-3 w-3" /> 修正
              </button>
            )}
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

  const renderMaterialCard = (m: MaterialStock, scope: DragScope, listIds: string[]) => {
    const isLow = m.stock < m.safety_stock
    const pct = m.safety_stock > 0 ? Math.min(100, (m.stock / m.safety_stock) * 100) : 100
    const isDraggingThis = dragging?.id === m.id
    const canDrop = !!dragging && sameScope(dragging.scope, scope) && dragging.id !== m.id
    return (
      <Card
        key={m.id}
        draggable={isAdmin}
        onDragStart={(e) => {
          if (!isAdmin) return
          setDragging({ scope, id: m.id })
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => setDragging(null)}
        onDragOver={(e) => {
          if (canDrop) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }
        }}
        onDrop={(e) => {
          if (canDrop) {
            e.preventDefault()
            handleCardDrop(scope, listIds, m.id)
          }
        }}
        className={`${isDraggingThis ? 'opacity-40' : ''} ${canDrop ? 'ring-2 ring-blue-400 ring-offset-1' : ''} transition-all`}
      >
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 min-w-0">
              {isAdmin && (
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-300 hover:text-gray-500" aria-label="拖拉排序" />
              )}
              <span className="font-medium break-words">{m.name}</span>
            </div>
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
          <div className="mt-2 flex items-baseline gap-2">
            <div className={`text-3xl font-bold ${isLow ? 'text-red-600' : ''}`}>
              {m.stock.toLocaleString()}
              <span className="ml-1 text-sm font-normal text-gray-500">{m.unit}</span>
            </div>
            {isAdmin && (
              <button
                onClick={() => openAdjustDialog({ kind: 'material', id: m.id, name: m.name, unit: m.unit })}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-600 hover:bg-blue-50 hover:text-blue-700"
                title="修正實際數量（誤差校正）"
              >
                <Edit3 className="h-3 w-3" /> 修正
              </button>
            )}
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
          <div className="grid gap-3 sm:grid-cols-3">
            {cakeBars.map(p => renderProductCard(p, { kind: 'product', category: 'cake_bar' }, cakeBars.map(x => x.id)))}
          </div>
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
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {cookies.map(p => renderProductCard(p, { kind: 'product', category: 'cookie' }, cookies.map(x => x.id)))}
            </div>
          )}
        </div>
      )}

      {(activeMaterials.length > 0 || !loading) && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">包材</h2>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCatAddOpen(true)}
                className="h-7 text-xs"
              >
                <FolderPlus className="mr-1 h-3 w-3" /> 新增分類
              </Button>
            )}
          </div>
          {activeMaterials.length === 0 && categories.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-2 text-3xl">📦</div>
                <p className="text-sm text-gray-500">尚未設定包材，點擊右上角「新增包材」開始</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              {categories.map(cat => {
                const catMats = activeMaterials.filter(m => m.category_id === cat.id)
                return (
                  <div key={cat.id}>
                    <div className="mb-2 flex items-center gap-2">
                      <Folder className="h-4 w-4 text-gray-500" />
                      <h3 className="text-sm font-semibold text-gray-700">{cat.name}</h3>
                      <span className="text-xs text-gray-400">({catMats.length})</span>
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => openCatEdit(cat)}
                            className="ml-1 text-gray-400 hover:text-blue-600"
                            title="重新命名"
                            aria-label={`重新命名 ${cat.name}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="text-gray-400 hover:text-red-600"
                            title="刪除分類"
                            aria-label={`刪除分類 ${cat.name}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                    {catMats.length === 0 ? (
                      <p className="ml-6 text-xs text-gray-400">此分類尚無包材</p>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {catMats.map(m => renderMaterialCard(m, { kind: 'material', categoryId: cat.id }, catMats.map(x => x.id)))}
                      </div>
                    )}
                  </div>
                )
              })}

              {(() => {
                const uncategorized = activeMaterials.filter(m => !m.category_id)
                if (uncategorized.length === 0) return null
                return (
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <Folder className="h-4 w-4 text-gray-400" />
                      <h3 className="text-sm font-semibold text-gray-500">未分類</h3>
                      <span className="text-xs text-gray-400">({uncategorized.length})</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {uncategorized.map(m => renderMaterialCard(m, { kind: 'material', categoryId: null }, uncategorized.map(x => x.id)))}
                    </div>
                  </div>
                )
              })()}
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
            <div>
              <Label>分類</Label>
              <Select
                value={matCategory || '__none__'}
                onValueChange={v => setMatCategory(!v || v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {matCategory
                      ? categories.find(c => c.id === matCategory)?.name ?? '未分類'
                      : '未分類'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">未分類</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div>
              <Label>分類</Label>
              <Select
                value={matEditCategory || '__none__'}
                onValueChange={v => setMatEditCategory(!v || v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue>
                    {matEditCategory
                      ? categories.find(c => c.id === matEditCategory)?.name ?? '未分類'
                      : '未分類'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">未分類</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* ── Add Category Dialog ── */}
      <Dialog open={catAddOpen} onOpenChange={setCatAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增包材分類</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>分類名稱 *</Label>
              <Input
                value={catName}
                onChange={e => setCatName(e.target.value)}
                placeholder="e.g. 蜂蜜蛋糕區、曲奇餅乾區"
                onKeyDown={e => { if (e.key === 'Enter' && catName.trim()) handleAddCategory() }}
                autoFocus
              />
              <p className="mt-1 text-xs text-gray-400">建立後在新增/編輯包材時可選擇此分類</p>
            </div>
            <Button className="w-full" onClick={handleAddCategory} disabled={saving || !catName.trim()}>
              {saving ? '儲存中...' : '新增分類'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit Category Dialog ── */}
      <Dialog open={catEditOpen} onOpenChange={setCatEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>重新命名分類</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>分類名稱 *</Label>
              <Input
                value={catEditName}
                onChange={e => setCatEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && catEditName.trim()) handleEditCategory() }}
                autoFocus
              />
            </div>
            <Button className="w-full" onClick={handleEditCategory} disabled={saving || !catEditName.trim()}>
              {saving ? '儲存中...' : '儲存變更'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Adjust Actual Stock Dialog ── */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修正實際數量</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {adjustTarget && (
              <>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  ⚠️ 此功能用於修正盤點誤差。會寫入一筆當天的調整記錄（差額 = 新值 − 目前實際），未來 D+N 預估會自動同步。
                </div>
                <div>
                  <Label className="text-xs text-gray-500">品項</Label>
                  <div className="mt-1 text-sm font-medium">
                    {adjustTarget.name}
                    {adjustTarget.unit && <span className="ml-1 text-xs text-gray-500">（{adjustTarget.unit}）</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">目前實際數量</Label>
                    <div className="mt-1 flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
                      {adjustLoading && adjustNewValue === '' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        adjustCurrentActual.toLocaleString()
                      )}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400">截至今天，不含未來訂單預扣</p>
                  </div>
                  <div>
                    <Label>修正為 *</Label>
                    <Input
                      type="number"
                      min={0}
                      value={adjustNewValue}
                      onChange={e => setAdjustNewValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAdjustSubmit() }}
                      autoFocus
                    />
                    {(() => {
                      const v = parseInt(adjustNewValue, 10)
                      if (Number.isNaN(v)) return null
                      const diff = v - adjustCurrentActual
                      if (diff === 0) return <p className="mt-1 text-[10px] text-gray-400">無變動</p>
                      return (
                        <p className={`mt-1 text-[10px] ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          差額 {diff > 0 ? '+' : ''}{diff.toLocaleString()}
                        </p>
                      )
                    })()}
                  </div>
                </div>
                <div>
                  <Label>原因 / 備註</Label>
                  <Input
                    value={adjustNote}
                    onChange={e => setAdjustNote(e.target.value)}
                    placeholder="e.g. 月底盤點發現少 10 個"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleAdjustSubmit}
                  disabled={adjustLoading || adjustNewValue === ''}
                >
                  {adjustLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  確認修正
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
