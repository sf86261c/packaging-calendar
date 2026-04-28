'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday, differenceInCalendarDays } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { OrderFormDialog } from '@/components/order-form-dialog'
import { StockAdjustmentDialog, type AdjustmentInput } from '@/components/stock-adjustment-dialog'
import {
  calculateIngredientDeductions,
  calculateMaterialDeductions as calcMaterialDeductionsHelper,
  replaceAdjustmentInventory,
} from '@/lib/stock'
import { logActivity } from '@/lib/activity'
import type { Product, PackagingStyle, ProductRecipe, ProductMaterialUsage } from '@/lib/types'

interface DaySummary {
  orders: number
  cakes: number
  cookies: number
  tubes: number
  pending: number
}

interface SearchHit {
  id: string
  customer_name: string
  order_date: string
  items_summary: string
  printed: boolean
  paid: boolean
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
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchHit[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchBoxRef = useRef<HTMLDivElement>(null)

  // 今日試吃/耗損/散單 dialog
  const [adjustmentOpen, setAdjustmentOpen] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [packagingStyles, setPackagingStyles] = useState<PackagingStyle[]>([])
  const [recipes, setRecipes] = useState<ProductRecipe[]>([])
  const [materialUsages, setMaterialUsages] = useState<ProductMaterialUsage[]>([])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const q = searchQuery.trim()
    if (q) {
      setSearchOpen(false)
      router.push(`/search?q=${encodeURIComponent(q)}`)
    }
  }

  // Debounced 即時搜尋（每次 keypress 後 180ms 執行 ilike 查詢）
  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      setSearchResults([])
      setSearchOpen(false)
      return
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      const { data } = await supabase
        .from('orders')
        .select('id, customer_name, order_date, printed, paid, order_items(quantity, product:products(name))')
        .ilike('customer_name', `%${q}%`)
        .order('order_date', { ascending: false })
        .limit(10)
      if (data) {
        const hits: SearchHit[] = data.map((o: any) => {
          const items = (o.order_items || []).filter((i: any) => i.quantity > 0)
          const summary = items.map((i: any) => `${i.product?.name ?? '?'}×${i.quantity}`).join(', ') || '無品項'
          return {
            id: o.id,
            customer_name: o.customer_name,
            order_date: o.order_date,
            items_summary: summary,
            printed: !!o.printed,
            paid: !!o.paid,
          }
        })
        setSearchResults(hits)
        setSearchOpen(true)
      }
      setSearchLoading(false)
    }, 180)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // 點擊搜尋框外部 → 關閉結果列表
  useEffect(() => {
    if (!searchOpen) return
    const handler = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [searchOpen])

  const handleSelectResult = (date: string) => {
    setSearchOpen(false)
    setSearchQuery('')
    router.push(`/calendar/${date}`)
  }

  useEffect(() => {
    if (!materialWarning) return
    const timer = setTimeout(() => setMaterialWarning(null), 8000)
    return () => clearTimeout(timer)
  }, [materialWarning])

  // mount 時抓取參考資料（試吃/耗損/散單 dialog 需要）
  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packaging_styles').select('*').eq('is_active', true),
      supabase.from('product_material_usage').select('id, product_id, material_id, packaging_style_id, quantity_per_unit'),
      supabase.from('product_recipe').select('id, product_id, ingredient_id, quantity_per_unit, created_at'),
    ]).then(([pr, pk, mu, r]) => {
      if (pr.data) setProducts(pr.data as Product[])
      if (pk.data) setPackagingStyles(pk.data as PackagingStyle[])
      if (mu.data) setMaterialUsages(mu.data as ProductMaterialUsage[])
      if (r.data) setRecipes(r.data as ProductRecipe[])
    })
  }, [])

  // 新增今日試吃/耗損/散單
  const handleSaveAdjustment = async (value: AdjustmentInput) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    try {
      const r = await supabase
        .from('stock_adjustments')
        .insert({
          date: todayStr,
          adjustment_type: value.adjustmentType,
          note: value.note || null,
        })
        .select()
        .single()
      if (r.error || !r.data) throw new Error(`建立調整失敗：${r.error?.message ?? 'no data'}`)
      const adjustmentId = r.data.id

      const itemRows = value.items.map((i) => ({
        adjustment_id: adjustmentId,
        product_id: i.productId,
        quantity: parseFloat(i.quantity),
        deduct_mode: i.deductMode,
        packaging_style_id: i.packagingStyleId || null,
      }))
      const r3 = await supabase.from('stock_adjustment_items').insert(itemRows)
      if (r3.error) throw new Error(`寫入扣減項失敗：${r3.error.message}`)

      // 分類 finished vs ingredient
      const finishedEntries: [string, number][] = []
      const finishedPackaging: Record<string, string | null> = {}
      const directDeductions: Record<string, number> = {}
      for (const i of value.items) {
        const qty = parseFloat(i.quantity)
        if (i.deductMode === 'finished') {
          finishedEntries.push([i.productId, qty])
          finishedPackaging[i.productId] = i.packagingStyleId || null
        } else {
          directDeductions[i.productId] = (directDeductions[i.productId] || 0) + qty
        }
      }

      const totalIngredient: Record<string, number> = { ...directDeductions }
      let totalMaterial: Record<string, number> = {}
      const adjMissingTubePkg: string[] = []
      let adjMissingMaterial: { productName: string; packagingName: string | null }[] = []

      if (finishedEntries.length > 0) {
        const ingr = calculateIngredientDeductions(finishedEntries, recipes)
        for (const [k, v] of Object.entries(ingr)) {
          totalIngredient[k] = (totalIngredient[k] || 0) + v
        }
        // tube_pkg 特例（散單/試吃選旋轉筒也要扣包裝庫存）
        for (const [productId, qty] of finishedEntries) {
          const product = products.find((p) => p.id === productId)
          if (product?.category !== 'tube') continue
          const pkgStyleId = finishedPackaging[productId]
          if (!pkgStyleId) continue
          const pkgName = packagingStyles.find((ps) => ps.id === pkgStyleId)?.name
          if (!pkgName) continue
          const tubePkgProduct = products.find((p) => p.category === 'tube_pkg' && p.name === pkgName)
          if (tubePkgProduct) {
            totalIngredient[tubePkgProduct.id] = (totalIngredient[tubePkgProduct.id] || 0) + qty
          } else if (!adjMissingTubePkg.includes(pkgName)) {
            adjMissingTubePkg.push(pkgName)
          }
        }
        const matResult = calcMaterialDeductionsHelper(
          finishedEntries,
          products,
          materialUsages,
          (productId) => finishedPackaging[productId] ?? null,
          (id) => packagingStyles.find((ps) => ps.id === id)?.name ?? null,
        )
        totalMaterial = matResult.deductions
        adjMissingMaterial = matResult.missingCombos
      }

      // 包材警示（沿用月曆頁的 materialWarning）
      const sections: string[] = []
      if (adjMissingMaterial.length > 0) {
        const lines = adjMissingMaterial.map((c) =>
          `· ${c.productName}${c.packagingName ? ` — ${c.packagingName}` : ''}`,
        )
        sections.push(`以下組合尚未設定包材對照，未扣減包材：\n${lines.join('\n')}`)
      }
      if (adjMissingTubePkg.length > 0) {
        const lines = adjMissingTubePkg.map((n) => `· ${n}`)
        sections.push(`以下旋轉筒包裝款式找不到對應的 tube_pkg 產品（已停用或名稱不符），未扣減包裝庫存：\n${lines.join('\n')}`)
      }
      if (sections.length > 0) setMaterialWarning(sections.join('\n\n'))

      await replaceAdjustmentInventory(supabase, adjustmentId, totalIngredient, totalMaterial, todayStr)

      const typeLabel =
        value.adjustmentType === 'sample' ? '試吃' :
        value.adjustmentType === 'waste' ? '耗損' : '散單'
      await logActivity(`新增${typeLabel}紀錄`, `adjustment:${adjustmentId}`, {
        類型: typeLabel,
        日期: todayStr,
        品項數: value.items.length,
      })
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
      throw err
    }
  }

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAdjustmentOpen(true)}
            className="h-9 text-xs"
          >
            🍰 今日試吃/耗損/散單
          </Button>
          <div ref={searchBoxRef} className="relative">
            <form onSubmit={handleSearchSubmit}>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="搜尋客戶..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                className="h-9 w-44 pl-8 text-sm"
                aria-label="搜尋客戶"
              />
              {searchLoading && (
                <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </form>
            {searchOpen && searchQuery.trim() && (
              <div className="absolute right-0 top-full z-50 mt-1 w-80 max-h-96 overflow-y-auto rounded-md border border-border bg-popover shadow-lg ring-1 ring-foreground/5">
                {searchResults.length === 0 && !searchLoading && (
                  <div className="px-3 py-3 text-xs text-muted-foreground">
                    找不到「{searchQuery}」相關訂單
                  </div>
                )}
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelectResult(r.order_date)}
                    className={`block w-full border-b border-border/50 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent ${r.printed ? 'bg-yellow-50/40' : ''}`}
                  >
                    <div className="text-sm font-medium text-foreground">
                      {r.customer_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.order_date} · {r.items_summary}
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {r.printed ? '✅ 已列印' : '⏳ 未列印'}
                      {r.paid ? ' · 💰 已付款' : ' · 💸 未付款'}
                    </div>
                  </button>
                ))}
                {searchResults.length >= 10 && (
                  <button
                    type="button"
                    onClick={(e) => handleSearchSubmit(e as unknown as React.FormEvent)}
                    className="block w-full border-t border-border bg-muted/50 px-3 py-2 text-center text-xs text-primary hover:bg-accent"
                  >
                    查看完整結果 →
                  </button>
                )}
              </div>
            )}
          </div>
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
                className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black text-white opacity-0 scale-50 transition-all duration-300 ease-out group-hover:opacity-100 group-hover:scale-100 focus-visible:opacity-100 focus-visible:scale-100 hover:bg-gray-700"
              >
                <span className="pointer-events-none absolute inset-0 rounded-full bg-black opacity-40 animate-ping" aria-hidden />
                <span className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-black/30 animate-ping [animation-delay:300ms]" aria-hidden />
                <Plus className="relative h-5 w-5" strokeWidth={2.5} />
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

      <StockAdjustmentDialog
        open={adjustmentOpen}
        onOpenChange={setAdjustmentOpen}
        products={products}
        packagingStyles={packagingStyles}
        onSave={handleSaveAdjustment}
      />
    </div>
  )
}
