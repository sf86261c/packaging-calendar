'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Loader2, Plus } from 'lucide-react'
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
}

const SAFETY_STOCK: Record<string, number> = {
  cake_bar: 2000,
  cookie: 200,
  tube: 100,
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

  const fetchInventory = async () => {
    setLoading(true)
    const { data: prods } = await supabase
      .from('products')
      .select('id, name, category, sort_order')
      .eq('is_active', true)
      .order('sort_order')

    if (prods) {
      // Get inventory totals per product
      const { data: invData } = await supabase
        .from('inventory')
        .select('product_id, quantity')

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
      })))
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchInventory()

    // Realtime: auto-refresh on inventory changes
    const channel = supabase
      .channel('inventory-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        fetchInventory()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

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

  const cakes = products.filter(p => p.category === 'cake_bar')
  const cookies = products.filter(p => p.category === 'cookie')
  const tubes = products.filter(p => p.category === 'tube')

  const renderCard = (p: ProductStock) => {
    const safety = SAFETY_STOCK[p.category] || 100
    const isLow = p.stock < safety
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
          <div className="mt-1 text-xs text-gray-500">安全庫存: {safety.toLocaleString()}</div>
          <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
            <div
              className={`h-2 rounded-full ${p.stock >= safety ? 'bg-green-500' : p.stock > 0 ? 'bg-orange-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(100, (p.stock / safety) * 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">📦 產品庫存</h1>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
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

      {cakes.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">🍰 蜂蜜蛋糕（條）</h2>
          <div className="grid gap-3 sm:grid-cols-3">{cakes.map(renderCard)}</div>
        </div>
      )}

      {cookies.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">🍪 曲奇</h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{cookies.map(renderCard)}</div>
        </div>
      )}

      {tubes.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold">🫙 圓筒</h2>
          <div className="grid gap-3 sm:grid-cols-3">{tubes.map(renderCard)}</div>
        </div>
      )}
    </div>
  )
}
