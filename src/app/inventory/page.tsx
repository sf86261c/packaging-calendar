'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { format, addDays } from 'date-fns'
import { Loader2, Plus, CalendarDays, Send, Pencil, Check, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
}

export default function InventoryPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<ProductStock[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState('')
  const [inboundQty, setInboundQty] = useState('')
  const [inboundNote, setInboundNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [asOfDate, setAsOfDate] = useState(format(addDays(new Date(), 15), 'yyyy-MM-dd'))
  const [sendingLine, setSendingLine] = useState(false)
  const [lineMessage, setLineMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [editingSafetyId, setEditingSafetyId] = useState<string | null>(null)
  const [editingSafetyValue, setEditingSafetyValue] = useState('')

  const fetchInventory = useCallback(async () => {
    setLoading(true)
    const { data: prods } = await supabase
      .from('products')
      .select('id, name, category, sort_order, safety_stock')
      .eq('is_active', true)
      .order('sort_order')

    if (prods) {
      // D+15: filter by inventory date column (order date, not created_at)
      const { data: invData } = await supabase
        .from('inventory')
        .select('product_id, quantity')
        .lte('date', asOfDate)

      const stockMap: Record<string, number> = {}
      if (invData) {
        for (const inv of invData) {
          stockMap[inv.product_id] = (stockMap[inv.product_id] || 0) + inv.quantity
        }
      }

      setProducts(prods.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        stock: stockMap[p.id] || 0,
        safety_stock: (p as { safety_stock?: number }).safety_stock ?? 100,
      })))
    }
    setLoading(false)
  }, [asOfDate])

  const fetchRef = useRef(fetchInventory)
  useEffect(() => { fetchRef.current = fetchInventory }, [fetchInventory])

  useEffect(() => { fetchInventory() }, [fetchInventory])

  useEffect(() => {
    const channel = supabase
      .channel('inventory-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        fetchRef.current()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    if (!lineMessage) return
    const timer = setTimeout(() => setLineMessage(null), 5000)
    return () => clearTimeout(timer)
  }, [lineMessage])

  const handleInbound = async () => {
    if (!selectedProduct || !inboundQty) return
    setSaving(true)
    await supabase.from('inventory').insert({
      product_id: selectedProduct,
      type: 'inbound',
      quantity: parseInt(inboundQty),
      reference_note: inboundNote || null,
    })
    setSelectedProduct('')
    setInboundQty('')
    setInboundNote('')
    setDialogOpen(false)
    setSaving(false)
    fetchInventory()
  }

  const startEditSafety = (p: ProductStock) => {
    setEditingSafetyId(p.id)
    setEditingSafetyValue(String(p.safety_stock))
  }

  const cancelEditSafety = () => {
    setEditingSafetyId(null)
    setEditingSafetyValue('')
  }

  const saveEditSafety = async () => {
    if (!editingSafetyId) return
    const value = parseInt(editingSafetyValue, 10)
    if (Number.isNaN(value) || value < 0) {
      cancelEditSafety()
      return
    }
    // 樂觀更新
    setProducts(prev => prev.map(p => p.id === editingSafetyId ? { ...p, safety_stock: value } : p))
    const editingId = editingSafetyId
    cancelEditSafety()
    const { error } = await supabase.from('products').update({ safety_stock: value }).eq('id', editingId)
    if (error) {
      alert(`儲存安全庫存失敗：${error.message}`)
      fetchInventory()
    }
  }

  const handleLineNotify = async () => {
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

  const today = format(new Date(), 'yyyy-MM-dd')
  const d15Date = format(addDays(new Date(), 15), 'yyyy-MM-dd')
  const isD15 = asOfDate === d15Date
  const isHistorical = asOfDate < today

  const cakes = products.filter(p => p.category === 'cake_bar')
  const cookies = products.filter(p => p.category === 'cookie')

  const renderCard = (p: ProductStock) => {
    const safety = p.safety_stock
    const isLow = p.stock < safety
    const isEditing = editingSafetyId === p.id
    return (
      <Card key={p.id}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">{p.name}</span>
            {isLow && <Badge variant="destructive" className="text-xs">低庫存</Badge>}
          </div>
          <div className={`mt-2 text-3xl font-bold ${isLow ? 'text-red-600' : ''}`}>
            {p.stock.toLocaleString()}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            <span>安全庫存:</span>
            {isEditing ? (
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
                <button onClick={saveEditSafety} className="text-green-600 hover:text-green-800" aria-label="儲存">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={cancelEditSafety} className="text-gray-400 hover:text-gray-600" aria-label="取消">
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <span>{safety.toLocaleString()}</span>
                <button
                  onClick={() => startEditSafety(p)}
                  className="ml-1 text-gray-400 hover:text-blue-600"
                  aria-label="編輯安全庫存"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full ${p.stock >= safety ? 'bg-green-500' : p.stock > 0 ? 'bg-orange-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(100, (p.stock / Math.max(safety, 1)) * 100)}%` }}
            />
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
          <h1 className="text-2xl font-bold text-gray-900">
            {isD15 ? 'D+15 預計庫存' : '產品庫存'}
          </h1>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          {isHistorical && <Badge variant="outline" className="text-xs">歷史庫存</Badge>}
          {isD15 && <Badge className="bg-blue-100 text-blue-800 text-xs">預計至 {asOfDate}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-gray-400" />
            <Input
              type="date"
              value={asOfDate}
              onChange={e => setAsOfDate(e.target.value)}
              className="h-8 w-36 text-sm"
            />
            {!isD15 && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAsOfDate(d15Date)}>
                D+15
              </Button>
            )}
          </div>
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
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> 入庫
            </Button>
            <DialogContent>
              <DialogHeader><DialogTitle>產品入庫</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>產品</Label>
                  <Select value={selectedProduct || undefined} onValueChange={(v) => v && setSelectedProduct(v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="選擇產品">
                        {selectedProduct ? products.find(p => p.id === selectedProduct)?.name : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
                <Button className="w-full" onClick={handleInbound} disabled={saving || !selectedProduct || !inboundQty}>
                  {saving ? '儲存中...' : '確認入庫'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {cakes.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">蜂蜜蛋糕（條）</h2>
          <div className="grid gap-3 sm:grid-cols-3">{cakes.map(renderCard)}</div>
        </div>
      )}

      {cookies.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">曲奇</h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{cookies.map(renderCard)}</div>
        </div>
      )}
    </div>
  )
}
