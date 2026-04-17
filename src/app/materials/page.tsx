'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { Loader2, Plus, Package, AlertTriangle, CalendarDays, Pencil, Trash2, Ban } from 'lucide-react'
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

// ─── Component ────────────────────────────────

export default function MaterialsPage() {
  const supabase = createClient()
  const [materials, setMaterials] = useState<Material[]>([])
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

  // Date picker
  const [asOfDate, setAsOfDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  // ─── Data fetching ────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [matRes, invRes] = await Promise.all([
      supabase.from('packaging_materials').select('*').order('name'),
      supabase.from('packaging_material_inventory').select('material_id, quantity').lte('date', asOfDate),
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

    setLoading(false)
  }, [asOfDate])

  useEffect(() => { fetchData() }, [fetchData])

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

  // ─── Derived data ─────────────────────────────

  const activeMaterials = materials.filter(m => m.is_active)
  const inactiveMaterials = materials.filter(m => !m.is_active)
  const lowStockCount = activeMaterials.filter(m => m.stock < m.safety_stock).length

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
              點擊右上角「新增包材」來新增包材品項，再至設定頁面設定每種產品消耗多少包材。
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
    </div>
  )
}
