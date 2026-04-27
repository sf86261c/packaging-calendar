'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Search, Loader2, Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { OrderFormDialog, type EditingOrder } from '@/components/order-form-dialog'

interface SearchResult {
  id: string
  customer_name: string
  order_date: string
  status: string
  printed: boolean
  paid: boolean
  batch_info: string | null
  cake_packaging_id: string | null
  cake_branding_id: string | null
  tube_packaging_id: string | null
  single_cake_packaging_id: string | null
  single_cake_branding_text: string | null
  packaging_summary: string
  items_summary: string
  items: EditingOrder['items']
}

export default function SearchPage() {
  const router = useRouter()
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [editing, setEditing] = useState<EditingOrder | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)

  const runSearch = useCallback(async (q: string) => {
    if (q.length === 0) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    setSearched(true)

    const { data } = await supabase
      .from('orders')
      .select(`
        id, customer_name, order_date, status, printed, paid, batch_info,
        cake_packaging_id, cake_branding_id, tube_packaging_id,
        single_cake_packaging_id, single_cake_branding_text,
        cake_pkg:packaging_styles!orders_cake_packaging_id_fkey(name),
        tube_pkg:packaging_styles!orders_tube_packaging_id_fkey(name),
        single_pkg:packaging_styles!orders_single_cake_packaging_id_fkey(name),
        order_items(quantity, packaging_id, product:products(id, name, category))
      `)
      .ilike('customer_name', `%${q}%`)
      .order('order_date', { ascending: false })
      .limit(50)

    if (data) {
      const rows: SearchResult[] = data.map((o: any) => {
        const items = (o.order_items || [])
          .filter((i: any) => i.quantity > 0)
          .map((i: any) => ({
            productId: i.product?.id || '',
            name: i.product?.name || '?',
            category: i.product?.category || '',
            quantity: i.quantity,
            packagingId: i.packaging_id || null,
          }))
        const itemsStr = items.map((i: any) => `${i.name} ×${i.quantity}`).join(', ')
        const pkgs = [o.cake_pkg, o.tube_pkg, o.single_pkg]
          .map((p: any) => p?.name).filter(Boolean).join(', ')
        return {
          id: o.id,
          customer_name: o.customer_name,
          order_date: o.order_date,
          status: o.status,
          printed: o.printed,
          paid: !!o.paid,
          batch_info: o.batch_info,
          cake_packaging_id: o.cake_packaging_id,
          cake_branding_id: o.cake_branding_id,
          tube_packaging_id: o.tube_packaging_id,
          single_cake_packaging_id: o.single_cake_packaging_id,
          single_cake_branding_text: o.single_cake_branding_text,
          packaging_summary: pkgs || '未指定包裝',
          items_summary: itemsStr || '無品項',
          items: items.map((i: any) => ({
            productId: i.productId,
            category: i.category,
            quantity: i.quantity,
            packagingId: i.packagingId,
          })),
        }
      })
      setResults(rows)
    }
    setLoading(false)
  }, [])

  const handleSearch = (q: string) => {
    setQuery(q)
    runSearch(q)
  }

  const openEdit = (r: SearchResult) => {
    setEditing({
      id: r.id,
      order_date: r.order_date,
      customer_name: r.customer_name,
      status: r.status,
      batch_info: r.batch_info,
      paid: r.paid,
      cake_packaging_id: r.cake_packaging_id,
      cake_branding_id: r.cake_branding_id,
      tube_packaging_id: r.tube_packaging_id,
      single_cake_packaging_id: r.single_cake_packaging_id,
      single_cake_branding_text: r.single_cake_branding_text,
      items: r.items,
    })
    setDialogOpen(true)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">🔍 客戶搜尋</h1>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="輸入客戶姓名..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-10 text-base"
          autoFocus
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
      </div>

      {warning && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex items-start justify-between">
            <pre className="whitespace-pre-wrap font-sans">{warning}</pre>
            <button onClick={() => setWarning(null)} className="ml-2 text-amber-600 hover:text-amber-800">✕</button>
          </div>
        </div>
      )}

      {searched && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">找到 {results.length} 筆結果</p>
          {results.map((r) => (
            <Card
              key={r.id}
              className={`transition-colors ${r.printed ? 'bg-yellow-50' : ''}`}
            >
              <CardContent className="flex items-center justify-between py-3">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => router.push(`/calendar/${r.order_date}`)}
                >
                  <div className="font-medium">{r.customer_name}</div>
                  <div className="text-sm text-gray-500">{r.order_date} · {r.items_summary}</div>
                  <div className="text-xs text-gray-400">
                    {r.packaging_summary}
                    {r.printed && ' · ✅ 已列印'}
                    {r.paid ? ' · 💰 已付款' : ' · 💸 未付款'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{r.status}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-blue-500 hover:text-blue-700"
                    onClick={(e) => { e.stopPropagation(); openEdit(r) }}
                    aria-label="編輯"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {results.length === 0 && !loading && (
            <p className="py-8 text-center text-gray-400">找不到「{query}」相關的訂單</p>
          )}
        </div>
      )}

      {!searched && (
        <p className="py-12 text-center text-gray-400">輸入客戶姓名開始搜尋</p>
      )}

      <OrderFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        initialDate={editing?.order_date ?? ''}
        editingOrder={editing}
        allowDateChange
        onSaved={() => runSearch(query)}
        onWarning={(msg) => setWarning(msg)}
      />
    </div>
  )
}
