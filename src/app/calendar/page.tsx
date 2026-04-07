'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, CalendarDays, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface DaySummary {
  orders: number
  cakes: number
  cookies: number
  tubes: number
  pending: number
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export default function CalendarPage() {
  const router = useRouter()
  const supabase = createClient()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [summaries, setSummaries] = useState<Record<string, DaySummary>>({})
  const [loading, setLoading] = useState(true)

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
    const startPadding = getDay(monthStart)
    return { allDays, startPadding }
  }, [currentMonth])

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
      const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

      const { data: orders } = await supabase
        .from('orders')
        .select('id, order_date, status, order_items(quantity, product:products(category))')
        .gte('order_date', monthStart)
        .lte('order_date', monthEnd)

      const map: Record<string, DaySummary> = {}
      if (orders) {
        for (const order of orders) {
          const date = order.order_date
          if (!map[date]) map[date] = { orders: 0, cakes: 0, cookies: 0, tubes: 0, pending: 0 }
          map[date].orders++
          if (['待', '延'].includes(order.status)) map[date].pending++
          const items = (order as any).order_items || []
          for (const item of items) {
            const cat = item.product?.category
            if (cat === 'cake') map[date].cakes += item.quantity
            else if (cat === 'cookie') map[date].cookies += item.quantity
            else if (cat === 'tube') map[date].tubes += item.quantity
          }
        }
      }
      setSummaries(map)
      setLoading(false)
    }
    fetchData()
  }, [currentMonth])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {format(currentMonth, 'yyyy 年 M 月', { locale: zhTW })}
        </h1>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date())}>
            <CalendarDays className="mr-1 h-4 w-4" />
            今天
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-500">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: days.startPadding }).map((_, i) => (
          <div key={`pad-${i}`} className="min-h-[100px] rounded-lg bg-gray-50" />
        ))}
        {days.allDays.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const s = summaries[dateStr]
          const today = isToday(day)
          return (
            <div
              key={dateStr}
              onClick={() => router.push(`/calendar/${dateStr}`)}
              className={`min-h-[100px] cursor-pointer rounded-lg border p-2 transition-colors hover:border-blue-300 hover:bg-blue-50/50 ${
                today ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className={`text-sm font-medium ${today ? 'text-blue-700' : 'text-gray-700'}`}>
                {format(day, 'd')}
              </div>
              {s && s.orders > 0 && (
                <div className="mt-1 space-y-1">
                  <div className="text-xs text-gray-500">{s.orders} 筆訂單</div>
                  <div className="flex flex-wrap gap-1">
                    {s.cakes > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0">🍰 {s.cakes}</Badge>}
                    {s.cookies > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0">🍪 {s.cookies}</Badge>}
                    {s.tubes > 0 && <Badge variant="secondary" className="text-[10px] px-1 py-0">🫙 {s.tubes}</Badge>}
                  </div>
                  {s.pending > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-orange-300 text-orange-600">
                      待處理 {s.pending}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
