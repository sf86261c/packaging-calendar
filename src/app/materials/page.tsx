'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { Loader2, Plus, Package, Settings, AlertTriangle } from 'lucide-react'
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

interface Material {
  id: string
  name: string
  unit: string
  safety_stock: number
  is_active: boolean
  stock: number
}

interface UsageRow {
  id: string
  product_id: string
  material_id: string
  quantity_per_unit: number
  product_name: string
}

export default function MaterialsPage() {
  const supabase = createClient()
  const [materials, setMaterials] = useState<Material[]>([])
  const [usages, setUsages] = useState<UsageRow[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Add material dialog
  const [addOpen, setAddOpen] = useState(false)
  const [matName, setMatName] = useState('')
  const [matUnit, setMatUnit] = useState('個')
  const [matSafety, setMatSafety] = useState('100')
  const [saving, setSaving] = useState(false)

  // Inbound dialog
  const [inboundOpen, setInboundOpen] = useState(false)
  const [inboundMat, setInboundMat] = useState('')
  const [inboundQty, setInboundQty] = useState('')
  const [inboundNote, setInboundNote] = useState('')

  // Usage mapping dialog
  const [usageOpen, setUsageOpen] = useState(false)
  const [usageProduct, setUsageProduct] = useState('')
  const [usageMaterial, setUsageMaterial] = useState('')
  const [usageQty, setUsageQty] = useState('1')

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [matRes, invRes, usageRes, prodRes] = await Promise.all([
      supabase.from('packaging_materials').select('*').order('name'),
      supabase.from('packaging_material_inventory').select('material_id, quantity'),
      supabase.from('product_material_usage').select('id, product_id, material_id, quantity_per_unit, product:products(name)'),
      supabase.from('products').select('id, name, category').eq('is_active', true).order('sort_order'),
    ])

    const stockMap: Record<string, number> = {}
    if (invRes.data) {
      for (const inv of invRes.data) {
        stockMap[inv.material_id] = (stockMap[inv.material_id] || 0) + inv.quantity
      }
    }

    if (matRes.data) {
      setMaterials(matRes.data.map((m: any) => ({
        ...m,
        stock: stockMap[m.id] || 0,
      })))
    }

    if (usageRes.data) {
      setUsages(usageRes.data.map((u: any) => ({
        id: u.id,
        product_id: u.product_id,
        material_id: u.material_id,
        quantity_per_unit: u.quantity_per_unit,
        product_name: u.product?.name || '未知',
      })))
    }

    if (prodRes.data) setProducts(prodRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAddMaterial = async () => {
    if (!matName.trim()) return
    setSaving(true)
    await supabase.from('packaging_materials').insert({
      name: matName.trim(),
      unit: matUnit,
      safety_stock: parseInt(matSafety) || 100,
    })
    setMatName(''); setMatUnit('個'); setMatSafety('100')
    setAddOpen(false)
    setSaving(false)
    fetchData()
  }

  const handleInbound = async () => {
    if (!inboundMat || !inboundQty) return
    setSaving(true)
    await supabase.from('packaging_material_inventory').insert({
      material_id: inboundMat,
      type: 'inbound',
      quantity: parseInt(inboundQty),
      reference_note: inboundNote || null,
    })
    setInboundMat(''); setInboundQty(''); setInboundNote('')
    setInboundOpen(false)
    setSaving(false)
    fetchData()
  }

  const handleAddUsage = async () => {
    if (!usageProduct || !usageMaterial || !usageQty) return
    setSaving(true)
    await supabase.from('product_material_usage').insert({
      product_id: usageProduct,
      material_id: usageMaterial,
      quantity_per_unit: parseFloat(usageQty),
    })
    setUsageProduct(''); setUsageMaterial(''); setUsageQty('1')
    setUsageOpen(false)
    setSaving(false)
    fetchData()
  }

  const handleDeleteUsage = async (id: string) => {
    await supabase.from('product_material_usage').delete().eq('id', id)
    fetchData()
  }

  const handleToggleActive = async (id: string, isActive: boolean) => {
    await supabase.from('packaging_materials').update({ is_active: !isActive }).eq('id', id)
    fetchData()
  }

  const activeMaterials = materials.filter(m => m.is_active)
  const lowStockCount = activeMaterials.filter(m => m.stock < m.safety_stock).length

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">包材庫存</h1>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          {lowStockCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="mr-1 h-3 w-3" /> {lowStockCount} 項低庫存
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setUsageOpen(true)}>
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

      {/* Material stock cards */}
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
                    {isLow && <Badge variant="destructive" className="text-xs">低庫存</Badge>}
                  </div>
                  <div className={`mt-2 text-3xl font-bold ${isLow ? 'text-red-600' : ''}`}>
                    {m.stock.toLocaleString()}
                    <span className="ml-1 text-sm font-normal text-gray-500">{m.unit}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">安全庫存: {m.safety_stock.toLocaleString()}</div>
                  <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                    <div
                      className={`h-2 rounded-full ${m.stock >= m.safety_stock ? 'bg-green-500' : m.stock > 0 ? 'bg-orange-500' : 'bg-red-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Usage mapping table */}
      {usages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">產品 → 包材用量對照</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>產品</TableHead>
                  <TableHead>包材</TableHead>
                  <TableHead className="w-24">每單位用量</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usages.map(u => {
                  const mat = materials.find(m => m.id === u.material_id)
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="text-sm">{u.product_name}</TableCell>
                      <TableCell className="text-sm">{mat?.name || '未知'}</TableCell>
                      <TableCell className="text-sm">{u.quantity_per_unit} {mat?.unit || ''}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-600"
                          onClick={() => handleDeleteUsage(u.id)}>
                          刪除
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Inactive materials */}
      {materials.filter(m => !m.is_active).length > 0 && (
        <Card className="mt-4">
          <CardHeader><CardTitle className="text-sm text-gray-400">已停用包材</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {materials.filter(m => !m.is_active).map(m => (
                <Badge key={m.id} variant="outline" className="text-gray-400 line-through cursor-pointer"
                  onClick={() => handleToggleActive(m.id, m.is_active)}>
                  {m.name} (點擊啟用)
                </Badge>
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
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
            <Button className="w-full" onClick={handleAddMaterial} disabled={saving || !matName.trim()}>
              {saving ? '儲存中...' : '新增包材'}
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
              <Select value={inboundMat} onValueChange={v => v && setInboundMat(v)}>
                <SelectTrigger><SelectValue placeholder="選擇包材" /></SelectTrigger>
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

      {/* ── Usage Mapping Dialog ── */}
      <Dialog open={usageOpen} onOpenChange={setUsageOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>設定用量對照</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>產品</Label>
              <Select value={usageProduct} onValueChange={v => v && setUsageProduct(v)}>
                <SelectTrigger><SelectValue placeholder="選擇產品" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>包材</Label>
              <Select value={usageMaterial} onValueChange={v => v && setUsageMaterial(v)}>
                <SelectTrigger><SelectValue placeholder="選擇包材" /></SelectTrigger>
                <SelectContent>
                  {activeMaterials.map(m => <SelectItem key={m.id} value={m.id}>{m.name} ({m.unit})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>每單位用量</Label>
              <Input type="number" min={0} step={0.1} value={usageQty} onChange={e => setUsageQty(e.target.value)} placeholder="1" />
            </div>
            <Button className="w-full" onClick={handleAddUsage} disabled={saving || !usageProduct || !usageMaterial}>
              {saving ? '儲存中...' : '新增對照'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
