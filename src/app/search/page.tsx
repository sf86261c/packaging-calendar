'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface SearchResult {
  id: string
  customer_name: string
  order_date: string
  status: string
  printed: boolean
  packaging_style: { name: string } | null
  items_summary: string
}

export default function SearchPage() {
  const router = useRouter()
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = async (q: string) => {
    setQuery(q)
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
        id, customer_name, order_date, status, printed,
        packaging_style:packaging_styles(name),
        order_items(quantity, product:products(name))
      `)
      .ilike('customer_name', `%${q}%`)
      .order('order_date', { ascending: false })
      .limit(50)

    if (data) {
      const rows: SearchResult[] = data.map((o: any) => {
        const items = (o.order_items || [])
          .filter((i: any) => i.quantity > 0)
          .map((i: any) => `${i.product?.name || '?'} ×${i.quantity}`)
          .join(', ')
        return {
          id: o.id,
          customer_name: o.customer_name,
          order_date: o.order_date,
          status: o.status,
          printed: o.printed,
          packaging_style: o.packaging_style,
          items_summary: items || '無品項',
        }
      })
      setResults(rows)
    }
    setLoading(false)
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

      {searched && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">找到 {results.length} 筆結果</p>
          {results.map((r) => (
            <Card
              key={r.id}
              className={`cursor-pointer transition-colors hover:bg-gray-50 ${r.printed ? 'bg-yellow-50' : ''}`}
              onClick={() => router.push(`/calendar/${r.order_date}`)}
            >
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium">{r.customer_name}</div>
                  <div className="text-sm text-gray-500">{r.order_date} · {r.items_summary}</div>
                  <div className="text-xs text-gray-400">
                    {r.packaging_style?.name || '未指定包裝'}
                    {r.printed && ' · ✅ 已列印'}
                  </div>
                </div>
                <Badge variant="outline">{r.status}</Badge>
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
    </div>
  )
}
