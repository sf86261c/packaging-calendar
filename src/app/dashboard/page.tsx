'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function DashboardPage() {
  const supabase = createClient()
  const [month, setMonth] = useState(new Date())
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalCakes: 0,
    totalCookies: 0,
    pendingCount: 0,
    packagingStats: [] as { name: string; count: number }[],
    cookieStats: [] as { name: string; count: number }[],
  })

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      const ms = format(startOfMonth(month), 'yyyy-MM-dd')
      const me = format(endOfMonth(month), 'yyyy-MM-dd')

      // Orders with items
      const { data: orders } = await supabase
        .from('orders')
        .select(`
          id, status,
          packaging_style:packaging_styles(name),
          order_items(quantity, product:products(name, category))
        `)
        .gte('order_date', ms)
        .lte('order_date', me)

      let totalOrders = 0, totalCakes = 0, totalCookies = 0, pendingCount = 0
      const pkgMap: Record<string, number> = {}
      const cookieMap: Record<string, number> = {}

      if (orders) {
        totalOrders = orders.length
        for (const o of orders as any[]) {
          if (['待', '延'].includes(o.status)) pendingCount++
          const pkgName = o.packaging_style?.name
          if (pkgName) pkgMap[pkgName] = (pkgMap[pkgName] || 0) + 1
          for (const item of (o.order_items || [])) {
            const cat = item.product?.category
            const name = item.product?.name
            if (cat === 'cake') totalCakes += item.quantity
            if (cat === 'cookie') {
              totalCookies += item.quantity
              if (name) cookieMap[name] = (cookieMap[name] || 0) + item.quantity
            }
          }
        }
      }

      setStats({
        totalOrders,
        totalCakes,
        totalCookies,
        pendingCount,
        packagingStats: Object.entries(pkgMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        cookieStats: Object.entries(cookieMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      })
      setLoading(false)
    }
    fetch()
  }, [month])

  const maxPkg = Math.max(...stats.packagingStats.map(p => p.count), 1)
  const maxCookie = Math.max(...stats.cookieStats.map(c => c.count), 1)
  const pkgColors = ['bg-amber-400', 'bg-pink-400', 'bg-blue-400', 'bg-green-400', 'bg-purple-400']
  const cookieColors = ['bg-orange-400', 'bg-yellow-600', 'bg-indigo-400', 'bg-teal-400', 'bg-rose-400', 'bg-cyan-400']

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">📊 統計儀表板</h1>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          <Button variant="outline" size="icon" onClick={() => setMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{format(month, 'yyyy 年 M 月', { locale: zhTW })}</span>
          <Button variant="outline" size="icon" onClick={() => setMonth(m => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">本月訂單</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.totalOrders}</div><p className="text-xs text-gray-500">筆</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">🍰 蛋糕出貨</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.totalCakes.toLocaleString()}</div><p className="text-xs text-gray-500">個</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">🍪 曲奇出貨</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.totalCookies.toLocaleString()}</div><p className="text-xs text-gray-500">個</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">待處理</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-orange-600">{stats.pendingCount}</div><p className="text-xs text-gray-500">筆訂單</p></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">包裝款式統計</CardTitle></CardHeader>
          <CardContent>
            {stats.packagingStats.length === 0 && !loading && (
              <p className="py-4 text-center text-sm text-gray-400">本月尚無資料</p>
            )}
            <div className="space-y-3">
              {stats.packagingStats.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between">
                  <span className="text-sm w-32 truncate">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 rounded-full bg-gray-200">
                      <div className={`h-2 rounded-full ${pkgColors[i % pkgColors.length]}`} style={{ width: `${(p.count / maxPkg) * 100}%` }} />
                    </div>
                    <span className="text-sm font-medium w-10 text-right">{p.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">🍪 曲奇銷量分析</CardTitle></CardHeader>
          <CardContent>
            {stats.cookieStats.length === 0 && !loading && (
              <p className="py-4 text-center text-sm text-gray-400">本月尚無資料</p>
            )}
            <div className="space-y-3">
              {stats.cookieStats.map((c, i) => (
                <div key={c.name} className="flex items-center justify-between">
                  <span className="text-sm w-24 truncate">{c.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 rounded-full bg-gray-200">
                      <div className={`h-2 rounded-full ${cookieColors[i % cookieColors.length]}`} style={{ width: `${(c.count / maxCookie) * 100}%` }} />
                    </div>
                    <span className="text-sm font-medium w-10 text-right">{c.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
