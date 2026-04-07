'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths, addMonths, eachDayOfInterval, parseISO } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
  LineChart, Line,
  AreaChart, Area,
  ResponsiveContainer,
} from 'recharts'

const COLORS_SOFT = ['#f59e0b', '#ec4899', '#3b82f6', '#22c55e', '#a855f7', '#14b8a6', '#f97316', '#6366f1']

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
    dailyShipments: [] as { date: string; cakes: number; cookies: number }[],
    dailyOrders: [] as { date: string; orders: number }[],
  })

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const monthStart = startOfMonth(month)
      const monthEnd = endOfMonth(month)
      const ms = format(monthStart, 'yyyy-MM-dd')
      const me = format(monthEnd, 'yyyy-MM-dd')

      const { data: orders } = await supabase
        .from('orders')
        .select(`
          id, status, printed, order_date,
          cake_pkg:packaging_styles!orders_cake_packaging_id_fkey(name),
          tube_pkg:packaging_styles!orders_tube_packaging_id_fkey(name),
          single_pkg:packaging_styles!orders_single_cake_packaging_id_fkey(name),
          order_items(quantity, product:products(name, category))
        `)
        .gte('order_date', ms)
        .lte('order_date', me)

      let totalOrders = 0
      let totalCakes = 0
      let totalCookies = 0
      let pendingCount = 0
      const pkgMap: Record<string, number> = {}
      const cookieMap: Record<string, number> = {}

      // Prepare daily maps
      const dailyCakeMap: Record<string, number> = {}
      const dailyCookieMap: Record<string, number> = {}
      const dailyOrderMap: Record<string, number> = {}

      // Initialize all days in month
      const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
      for (const day of allDays) {
        const key = format(day, 'yyyy-MM-dd')
        dailyCakeMap[key] = 0
        dailyCookieMap[key] = 0
        dailyOrderMap[key] = 0
      }

      if (orders) {
        totalOrders = orders.length
        for (const o of orders as any[]) {
          if (!o.printed) pendingCount++

          const orderDate = o.order_date as string

          // Count daily orders
          dailyOrderMap[orderDate] = (dailyOrderMap[orderDate] || 0) + 1

          // Count packaging types
          for (const pkg of [o.cake_pkg, o.tube_pkg, o.single_pkg]) {
            const name = (pkg as any)?.name
            if (name) pkgMap[name] = (pkgMap[name] || 0) + 1
          }

          for (const item of (o.order_items || [])) {
            const cat = item.product?.category
            const name = item.product?.name
            if (cat === 'cake' || cat === 'single_cake' || cat === 'tube') {
              totalCakes += item.quantity
              dailyCakeMap[orderDate] = (dailyCakeMap[orderDate] || 0) + item.quantity
            }
            if (cat === 'cookie') {
              totalCookies += item.quantity
              if (name) cookieMap[name] = (cookieMap[name] || 0) + item.quantity
              dailyCookieMap[orderDate] = (dailyCookieMap[orderDate] || 0) + item.quantity
            }
          }
        }
      }

      // Build daily arrays
      const dailyShipments = allDays.map(day => {
        const key = format(day, 'yyyy-MM-dd')
        return {
          date: format(day, 'M/d'),
          cakes: dailyCakeMap[key] || 0,
          cookies: dailyCookieMap[key] || 0,
        }
      })

      const dailyOrders = allDays.map(day => {
        const key = format(day, 'yyyy-MM-dd')
        return {
          date: format(day, 'M/d'),
          orders: dailyOrderMap[key] || 0,
        }
      })

      setStats({
        totalOrders,
        totalCakes,
        totalCookies,
        pendingCount,
        packagingStats: Object.entries(pkgMap)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
        cookieStats: Object.entries(cookieMap)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
        dailyShipments,
        dailyOrders,
      })
      setLoading(false)
    }
    fetchData()
  }, [month])

  return (
    <div>
      {/* Header with month navigation */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">統計儀表板</h1>
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

      {/* Top 4 stat cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">本月訂單</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.totalOrders}</div><p className="text-xs text-gray-500">筆</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">蛋糕出貨</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.totalCakes.toLocaleString()}</div><p className="text-xs text-gray-500">個</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">曲奇出貨</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{stats.totalCookies.toLocaleString()}</div><p className="text-xs text-gray-500">個</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">未列印</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold text-orange-600">{stats.pendingCount}</div><p className="text-xs text-gray-500">筆訂單</p></CardContent>
        </Card>
      </div>

      {/* Row 1: Packaging BarChart + Cookie PieChart */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {/* Packaging Style - Horizontal Bar Chart */}
        <Card>
          <CardHeader><CardTitle className="text-base">包裝款式統計</CardTitle></CardHeader>
          <CardContent>
            {stats.packagingStats.length === 0 && !loading ? (
              <p className="py-4 text-center text-sm text-gray-400">本月尚無資料</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={stats.packagingStats}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: any) => [`${value} 次`, '使用次數']}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                  <Bar dataKey="count" name="使用次數" radius={[0, 4, 4, 0]}>
                    {stats.packagingStats.map((_, i) => (
                      <Cell key={`pkg-${i}`} fill={COLORS_SOFT[i % COLORS_SOFT.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Cookie Sales - Pie Chart */}
        <Card>
          <CardHeader><CardTitle className="text-base">曲奇銷量分析</CardTitle></CardHeader>
          <CardContent>
            {stats.cookieStats.length === 0 && !loading ? (
              <p className="py-4 text-center text-sm text-gray-400">本月尚無資料</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={stats.cookieStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="count"
                    nameKey="name"
                    label={({ name, percent }: any) =>
                      `${name} ${((percent || 0) * 100).toFixed(0)}%`
                    }
                    labelLine={{ stroke: '#999', strokeWidth: 1 }}
                  >
                    {stats.cookieStats.map((_, i) => (
                      <Cell key={`cookie-${i}`} fill={COLORS_SOFT[i % COLORS_SOFT.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, name: any) => [`${value} 個`, name]}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Shipment Trend LineChart + Daily Orders AreaChart */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Weekly/Daily Shipment Trend - Line Chart */}
        <Card>
          <CardHeader><CardTitle className="text-base">每週出貨量趨勢</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={stats.dailyShipments}
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="cakes"
                  name="蛋糕"
                  stroke="#ec4899"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="cookies"
                  name="曲奇"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Daily Order Count - Area Chart */}
        <Card>
          <CardHeader><CardTitle className="text-base">每日訂單量</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart
                data={stats.dailyOrders}
                margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="orderGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: any) => [`${value} 筆`, '訂單數']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Area
                  type="monotone"
                  dataKey="orders"
                  name="訂單數"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#orderGradient)"
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
