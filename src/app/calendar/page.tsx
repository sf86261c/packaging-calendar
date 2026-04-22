'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday, differenceInCalendarDays } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { OrderFormDialog } from '@/components/order-form-dialog'

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
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null)
  const [materialWarning, setMaterialWarning] = useState<string | null>(null)

  useEffect(() => {
    if (!materialWarning) return
    const timer = setTimeout(() => setMaterialWarning(null), 8000)
    return () => clearTimeout(timer)
  }, [materialWarning])

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
    const startPadding = getDay(monthStart)
    return { allDays, startPadding }
  }, [currentMonth])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd')

    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_date, status, printed, order_items(quantity, product:products(category))')
      .gte('order_date', monthStart)
      .lte('order_date', monthEnd)

    const map: Record<string, DaySummary> = {}
    if (orders) {
      for (const order of orders) {
        const date = order.order_date
        if (!map[date]) map[date] = { orders: 0, cakes: 0, cookies: 0, tubes: 0, pending: 0 }
        map[date].orders++
        if (!(order as any).printed) map[date].pending++
        const items = (order as any).order_items || []
        for (const item of items) {
          const cat = item.product?.category
          if (cat === 'cake' || cat === 'single_cake') map[date].cakes += item.quantity
          else if (cat === 'cookie') map[date].cookies += item.quantity
          else if (cat === 'tube') map[date].tubes += item.quantity
        }
      }
    }
    setSummaries(map)
    setLoading(false)
  }, [currentMonth])

  const fetchDataRef = useRef(fetchData)
  useEffect(() => { fetchDataRef.current = fetchData }, [fetchData])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const channel = supabase
      .channel('calendar-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchDataRef.current()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

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

      {materialWarning && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <div className="flex items-start justify-between">
            <pre className="whitespace-pre-wrap font-sans">{materialWarning}</pre>
            <button onClick={() => setMaterialWarning(null)} className="ml-2 text-amber-600 hover:text-amber-800">✕</button>
          </div>
        </div>
      )}

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
          const daysUntil = differenceInCalendarDays(day, new Date())
          const urgent = daysUntil >= 0 && daysUntil <= 4 && (s?.pending || 0) > 0
          return (
            <div
              key={dateStr}
              onClick={() => router.push(`/calendar/${dateStr}`)}
              className={`group relative min-h-[60px] sm:min-h-[100px] cursor-pointer rounded-lg border p-1.5 sm:p-2 transition-colors hover:border-blue-300 hover:bg-blue-50/50 ${
                urgent
                  ? 'border-pink-400 bg-pink-100'
                  : today
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 bg-white'
              }`}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setQuickAddDate(dateStr) }}
                aria-label={`快速新增 ${dateStr} 訂單`}
                className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black text-white transition-colors hover:bg-gray-700"
              >
                <Plus className="h-5 w-5" strokeWidth={2.5} />
              </button>
              <div className={`text-sm font-medium ${
                urgent ? 'text-pink-700' : today ? 'text-blue-700' : 'text-gray-700'
              }`}>
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
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1 py-0 ${
                        urgent
                          ? 'animate-pulse border-pink-500 bg-pink-200 text-pink-800 font-semibold'
                          : 'border-orange-300 text-orange-600'
                      }`}
                    >
                      未列印 {s.pending}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <OrderFormDialog
        open={!!quickAddDate}
        onOpenChange={(open) => { if (!open) setQuickAddDate(null) }}
        initialDate={quickAddDate || ''}
        onSaved={fetchData}
        onWarning={setMaterialWarning}
      />
    </div>
  )
}
