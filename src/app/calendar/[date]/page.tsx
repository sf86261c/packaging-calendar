'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { format, parseISO, addDays, subDays } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, ArrowLeft, Trash2, Loader2, Pencil, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { ProductRecipe, ProductMaterialUsage, StockAdjustment, StockAdjustmentItem } from '@/lib/types'
import {
  calculateIngredientDeductions,
  calculateMaterialDeductions as calcMaterialDeductionsHelper,
  replaceOrderInventory,
  deleteOrderWithInventory,
  replaceAdjustmentInventory,
  deleteAdjustmentWithInventory,
} from '@/lib/stock'
import { StockAdjustmentDialog } from '@/components/stock-adjustment-dialog'
import type { AdjustmentInput } from '@/components/stock-adjustment-dialog'
import { SplitOrderDialog, type SplitInput, type AppendInput } from '@/components/split-order-dialog'
import { logActivity } from '@/lib/activity'

interface BatchSibling {
  orderId: string
  date: string
  batch_info: string | null
  items: { productId: string; name: string; quantity: number }[]
}

interface OrderRow {
  id: string
  customer_name: string
  status: string
  batch_info: string | null
  batch_group_id: string | null
  notes: string | null
  printed: boolean
  paid: boolean
  cake_packaging_id: string | null
  cake_branding_id: string | null
  tube_packaging_id: string | null
  single_cake_packaging_id: string | null
  single_cake_branding_text: string | null
  cake_packaging?: { id: string; name: string } | null
  cake_branding?: { id: string; name: string } | null
  tube_packaging?: { id: string; name: string } | null
  single_cake_packaging?: { id: string; name: string } | null
  items: { productId: string; name: string; category: string; quantity: number; packagingId?: string | null }[]
}

export default function DayOrderPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const dateStr = params.date as string
  const date = parseISO(dateStr)

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [packagingStyles, setPackagingStyles] = useState<any[]>([])
  const [brandingStyles, setBrandingStyles] = useState<any[]>([])
  const [materialUsages, setMaterialUsages] = useState<ProductMaterialUsage[]>([])
  const [recipes, setRecipes] = useState<ProductRecipe[]>([])
  const [materialWarning, setMaterialWarning] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)

  // Form state
  const [formDate, setFormDate] = useState(dateStr)
  const [formName, setFormName] = useState('')
  const [formStatus, setFormStatus] = useState('')
  const [formBatch, setFormBatch] = useState('')
  const [formPaid, setFormPaid] = useState(false)
  const [formItems, setFormItems] = useState<Record<string, number>>({})
  const [formCakePackaging, setFormCakePackaging] = useState('')
  const [formCakeBranding, setFormCakeBranding] = useState('')
  const [formTubePackaging, setFormTubePackaging] = useState('')
  const [formSingleCakePackaging, setFormSingleCakePackaging] = useState<Record<string, string>>({})
  const [formSingleCakeBranding, setFormSingleCakeBranding] = useState('')
  const [showAllCookies, setShowAllCookies] = useState(false)
  const [saving, setSaving] = useState(false)
  const [duplicateName, setDuplicateName] = useState(false)
  const [confirmedDifferent, setConfirmedDifferent] = useState(false)

  // Adjustment state
  const [adjustments, setAdjustments] = useState<(StockAdjustment & { items: StockAdjustmentItem[] })[]>([])
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false)
  const [editingAdjustment, setEditingAdjustment] = useState<{
    id: string
    value: AdjustmentInput
  } | null>(null)

  const [splitDialogOpen, setSplitDialogOpen] = useState(false)
  const [batchSiblings, setBatchSiblings] = useState<Record<string, BatchSibling[]>>({})

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select(`
        id, customer_name, status, batch_info, batch_group_id, notes, printed, paid, single_cake_branding_text,
        cake_packaging_id, cake_branding_id, tube_packaging_id, single_cake_packaging_id,
        cake_packaging:packaging_styles!orders_cake_packaging_id_fkey(id, name),
        cake_branding:branding_styles!orders_cake_branding_id_fkey(id, name),
        tube_packaging:packaging_styles!orders_tube_packaging_id_fkey(id, name),
        single_cake_packaging:packaging_styles!orders_single_cake_packaging_id_fkey(id, name),
        order_items(quantity, packaging_id, product:products(id, name, category))
      `)
      .eq('order_date', dateStr)
      .order('created_at', { ascending: true })

    if (data) {
      const rows: OrderRow[] = data.map((o: any) => ({
        id: o.id,
        customer_name: o.customer_name,
        status: o.status,
        batch_info: o.batch_info,
        batch_group_id: o.batch_group_id ?? null,
        notes: o.notes ?? null,
        printed: o.printed,
        paid: !!o.paid,
        cake_packaging_id: o.cake_packaging_id,
        cake_branding_id: o.cake_branding_id,
        tube_packaging_id: o.tube_packaging_id,
        single_cake_packaging_id: o.single_cake_packaging_id,
        single_cake_branding_text: o.single_cake_branding_text,
        cake_packaging: o.cake_packaging,
        cake_branding: o.cake_branding,
        tube_packaging: o.tube_packaging,
        single_cake_packaging: o.single_cake_packaging,
        items: (o.order_items || [])
          .filter((i: any) => i.quantity > 0)
          .map((i: any) => ({
            productId: i.product?.id || '',
            name: i.product?.name || '',
            category: i.product?.category || '',
            quantity: i.quantity,
            packagingId: i.packaging_id || null,
          })),
      }))
      setOrders(rows)
    }
    setLoading(false)
  }, [dateStr])

  const fetchOrdersRef = useRef(fetchOrders)
  useEffect(() => { fetchOrdersRef.current = fetchOrders }, [fetchOrders])

  const fetchAdjustments = useCallback(async () => {
    const { data } = await supabase
      .from('stock_adjustments')
      .select(`
        id, date, adjustment_type, note, created_at,
        stock_adjustment_items (id, adjustment_id, product_id, quantity, deduct_mode, packaging_style_id)
      `)
      .eq('date', dateStr)
      .order('created_at', { ascending: false })

    if (data) {
      type Row = StockAdjustment & { stock_adjustment_items: StockAdjustmentItem[] }
      setAdjustments(
        (data as Row[]).map((a) => ({
          ...a,
          items: a.stock_adjustment_items,
        })),
      )
    }
  }, [dateStr])

  // 撈所有同 batch_group_id 的訂單作為兄弟批次。
  // 用 UUID 群組綁定取代「customer_name + batch_info」字串匹配,
  // 避免同名同姓客戶誤合併,也讓手動輸入備註不會誤觸發。
  // 只有透過「分批/追加」按鈕的訂單會被綁同一個 group。
  useEffect(() => {
    const groupIds = Array.from(
      new Set(orders.map((o) => o.batch_group_id).filter((g): g is string => !!g)),
    )
    if (groupIds.length === 0) {
      setBatchSiblings({})
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('orders')
        .select(`
          id, order_date, batch_group_id, batch_info,
          order_items(quantity, product_id, product:products(name))
        `)
        .in('batch_group_id', groupIds)

      if (cancelled || !data) return

      const result: Record<string, BatchSibling[]> = {}
      for (const o of orders) {
        if (!o.batch_group_id) continue
        result[o.id] = (data as any[])
          .filter((s) => s.batch_group_id === o.batch_group_id && s.id !== o.id)
          .map((s) => ({
            orderId: s.id as string,
            date: s.order_date as string,
            batch_info: (s.batch_info as string | null) ?? null,
            items: ((s.order_items || []) as any[])
              .filter((i) => i.quantity > 0)
              .map((i) => ({
                productId: (i.product_id as string) || '',
                name: (i.product?.name as string) || '',
                quantity: i.quantity as number,
              })),
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
      }
      setBatchSiblings(result)
    })()
    return () => {
      cancelled = true
    }
  }, [orders])

  // Static reference data — only fetch once per mount
  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packaging_styles').select('*').eq('is_active', true),
      supabase.from('branding_styles').select('*').eq('is_active', true),
      supabase.from('product_material_usage').select('id, product_id, material_id, packaging_style_id, quantity_per_unit'),
      supabase.from('product_recipe').select('id, product_id, ingredient_id, quantity_per_unit, created_at'),
    ]).then(([pr, pk, br, mu, rc]) => {
      if (pr.data) setProducts(pr.data)
      if (pk.data) setPackagingStyles(pk.data)
      if (br.data) setBrandingStyles(br.data)
      if (mu.data) setMaterialUsages(mu.data as ProductMaterialUsage[])
      if (rc.data) setRecipes(rc.data as ProductRecipe[])
    })
  }, [])

  // Orders + adjustments depend on dateStr
  useEffect(() => {
    fetchOrders()
    fetchAdjustments()
  }, [fetchOrders, fetchAdjustments])

  // Realtime subscription rebuilt per dateStr (filter-bound)
  useEffect(() => {
    const channel = supabase
      .channel(`orders-${dateStr}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `order_date=eq.${dateStr}` }, () => {
        fetchOrdersRef.current()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        fetchOrdersRef.current()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [dateStr])

  useEffect(() => {
    if (!materialWarning) return
    const timer = setTimeout(() => setMaterialWarning(null), 8000)
    return () => clearTimeout(timer)
  }, [materialWarning])

  // 同名偵測：僅新增模式 + dialog 開啟時對 customer_name 做 debounce 檢查
  useEffect(() => {
    setConfirmedDifferent(false)
    if (editingOrderId || !dialogOpen) {
      setDuplicateName(false)
      return
    }
    const trimmed = formName.trim()
    if (!trimmed) {
      setDuplicateName(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('orders')
        .select('id')
        .eq('customer_name', trimmed)
        .limit(1)
      if (!cancelled) setDuplicateName(!!data && data.length > 0)
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [formName, editingOrderId, dialogOpen])

  // ─── Form helpers ───────────────────────────────────

  const resetForm = () => {
    setFormDate(dateStr)
    setFormName(''); setFormStatus(''); setFormBatch('')
    setFormPaid(false)
    setFormItems({})
    setFormCakePackaging(''); setFormCakeBranding('')
    setFormTubePackaging('')
    setFormSingleCakePackaging({}); setFormSingleCakeBranding('')
    setShowAllCookies(false)
    setEditingOrderId(null)
  }

  const openNewDialog = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEditDialog = (order: OrderRow) => {
    setShowAllCookies(false)
    setEditingOrderId(order.id)
    setFormDate(dateStr)
    setFormName(order.customer_name)
    setFormStatus(order.status)
    setFormBatch(order.batch_info || '')
    setFormPaid(order.paid)
    const items: Record<string, number> = {}
    for (const item of order.items) items[item.productId] = item.quantity
    setFormItems(items)
    setFormCakePackaging(order.cake_packaging_id || '')
    setFormCakeBranding(order.cake_branding_id || '')
    setFormTubePackaging(order.tube_packaging_id || '')
    // Load per-item packaging for single cakes
    const singlePkgMap: Record<string, string> = {}
    for (const item of order.items) {
      if (item.category === 'single_cake' && item.packagingId) {
        singlePkgMap[item.productId] = item.packagingId
      }
    }
    // Fallback: if no per-item packaging, try legacy single_cake_packaging_id
    if (Object.keys(singlePkgMap).length === 0 && order.single_cake_packaging_id) {
      for (const item of order.items) {
        if (item.category === 'single_cake') {
          singlePkgMap[item.productId] = order.single_cake_packaging_id!
        }
      }
    }
    setFormSingleCakePackaging(singlePkgMap)
    setFormSingleCakeBranding(order.single_cake_branding_text || '')
    setDialogOpen(true)
  }

  // ─── Inventory deduction ────────────────────────────

  const calculateDeductions = (itemEntries: [string, number][], tubePackagingId?: string) => {
    const deductions: Record<string, number> = calculateIngredientDeductions(itemEntries, recipes)
    const missingTubePkg: string[] = []

    let totalTubes = 0
    for (const [productId, qty] of itemEntries) {
      if (qty <= 0) continue
      const product = products.find((p: any) => p.id === productId)
      if (product?.category === 'tube') totalTubes += qty
    }

    if (tubePackagingId && totalTubes > 0) {
      const pkgStyleName = packagingStyles.find((ps) => ps.id === tubePackagingId)?.name
      if (pkgStyleName) {
        const tubePkg = products.find((p: any) => p.category === 'tube_pkg' && p.name === pkgStyleName)
        if (tubePkg) {
          deductions[tubePkg.id] = (deductions[tubePkg.id] || 0) + totalTubes
        } else {
          // 名稱對不上或產品已停用 → 提示用戶
          missingTubePkg.push(pkgStyleName)
        }
      }
    }

    return { deductions, missingTubePkg }
  }

  // ─── Packaging material deduction ─────────────────────

  const calculateMaterialDeductions = (
    itemEntries: [string, number][],
    orderCakePackagingId?: string,
    orderTubePackagingId?: string,
    singleCakePackagingMap?: Record<string, string>,
  ) => {
    return calcMaterialDeductionsHelper(
      itemEntries,
      products,
      materialUsages,
      (productId) => {
        const product = products.find((p) => p.id === productId)
        if (!product) return null
        if (product.category === 'cake') return orderCakePackagingId ?? null
        if (product.category === 'tube') return orderTubePackagingId ?? null
        if (product.category === 'single_cake') return singleCakePackagingMap?.[productId] ?? null
        return null
      },
      (id) => packagingStyles.find((ps) => ps.id === id)?.name ?? null,
    )
  }

  const showInventoryWarnings = (
    combos: { productName: string; packagingName: string | null }[],
    missingTubePkg: string[] = [],
  ) => {
    const sections: string[] = []
    if (combos.length > 0) {
      const lines = combos.map(c =>
        `· ${c.productName}${c.packagingName ? ` — ${c.packagingName}` : ''}`
      )
      sections.push(`以下組合尚未設定包材對照，未扣減包材：\n${lines.join('\n')}`)
    }
    if (missingTubePkg.length > 0) {
      const lines = missingTubePkg.map(n => `· ${n}`)
      sections.push(`以下旋轉筒包裝款式找不到對應的 tube_pkg 產品（已停用或名稱不符），未扣減包裝庫存：\n${lines.join('\n')}`)
    }
    if (sections.length > 0) setMaterialWarning(sections.join('\n\n'))
  }

  // ─── Save (add or edit) ─────────────────────────────

  const handleSaveOrder = async () => {
    if (!formName.trim() || !formDate) return
    if (!editingOrderId && duplicateName && !confirmedDifferent) return
    setSaving(true)

    const orderData: Record<string, unknown> = {
      order_date: formDate,
      customer_name: formName.trim(),
      status: formStatus || '待',
      batch_info: formBatch || null,
      paid: formPaid,
      cake_packaging_id: formCakePackaging || null,
      cake_branding_id: formCakeBranding || null,
      tube_packaging_id: formTubePackaging || null,
      single_cake_packaging_id: null, // per-item packaging now stored in order_items
      single_cake_branding_text: formSingleCakeBranding || null,
    }
    // 「非相同客戶」勾選 → 分配新 batch_group_id，避免與現有同名訂單在分批 UI 上連動
    if (!editingOrderId && confirmedDifferent) {
      orderData.batch_group_id = crypto.randomUUID()
    }

    const itemEntries = Object.entries(formItems).filter(([, qty]) => qty > 0)

    // Helper: build order_items rows with per-item packaging
    const buildItemRows = (orderId: string) =>
      itemEntries.map(([productId, quantity]) => {
        const product = products.find((p: any) => p.id === productId)
        return {
          order_id: orderId,
          product_id: productId,
          quantity,
          packaging_id: product?.category === 'single_cake' ? (formSingleCakePackaging[productId] || null) : null,
        }
      })

    try {
      let orderId: string
      if (editingOrderId) {
        const r1 = await supabase.from('orders').update(orderData).eq('id', editingOrderId)
        if (r1.error) throw new Error(`更新訂單失敗：${r1.error.message}`)
        const r2 = await supabase.from('order_items').delete().eq('order_id', editingOrderId)
        if (r2.error) throw new Error(`清除舊品項失敗：${r2.error.message}`)
        if (itemEntries.length > 0) {
          const r3 = await supabase.from('order_items').insert(buildItemRows(editingOrderId))
          if (r3.error) throw new Error(`寫入品項失敗：${r3.error.message}`)
        }
        orderId = editingOrderId
      } else {
        const r = await supabase.from('orders').insert(orderData).select('id').single()
        if (r.error || !r.data) throw new Error(`建立訂單失敗：${r.error?.message ?? 'no data returned'}`)
        orderId = r.data.id
        if (itemEntries.length > 0) {
          const r2 = await supabase.from('order_items').insert(buildItemRows(orderId))
          if (r2.error) throw new Error(`寫入品項失敗：${r2.error.message}`)
        }
      }

      const { deductions, missingTubePkg } = calculateDeductions(itemEntries, formTubePackaging || undefined)
      const matResult = calculateMaterialDeductions(
        itemEntries,
        formCakePackaging || undefined,
        formTubePackaging || undefined,
        formSingleCakePackaging,
      )
      // RPC：reverse + apply 在 server 端為單一 transaction（用 formDate，編輯時可能改了日期）
      await replaceOrderInventory(supabase, orderId, deductions, matResult.deductions, formDate)
      showInventoryWarnings(matResult.missingCombos, missingTubePkg)

      resetForm()
      setDialogOpen(false)
      fetchOrders()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (orderId: string) => {
    if (!confirm('確定要刪除這筆訂單嗎？')) return
    const target = orders.find((o) => o.id === orderId)
    try {
      await deleteOrderWithInventory(supabase, orderId)
      await logActivity('刪除訂單', `order:${orderId}`, {
        客戶: target?.customer_name ?? '',
        日期: dateStr,
      })
      fetchOrders()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  const handlePrintedToggle = async (orderId: string, printed: boolean) => {
    await supabase.from('orders').update({ printed }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, printed } : o))
    const target = orders.find((o) => o.id === orderId)
    await logActivity(printed ? '列印訂單' : '取消列印', `order:${orderId}`, {
      客戶: target?.customer_name ?? '',
      日期: dateStr,
    })
  }

  const handlePaidToggle = async (orderId: string, paid: boolean) => {
    await supabase.from('orders').update({ paid }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, paid } : o))
    const target = orders.find((o) => o.id === orderId)
    await logActivity(paid ? '標記已付款' : '標記未付款', `order:${orderId}`, {
      客戶: target?.customer_name ?? '',
      日期: dateStr,
    })
  }

  // ─── Split / Append 分批 ─────────────────────────────

  const handleSplitConfirm = async (
    { splits, appends }: { splits: SplitInput[]; appends: AppendInput[] },
  ) => {
    if (!editingOrderId) {
      alert('請先儲存訂單後再分批/追加')
      return
    }

    // batch_group_id：原訂單若已有(多次分批/追加),沿用以保持同群;否則產生新 UUID
    const editingOrder = orders.find((o) => o.id === editingOrderId)
    const batchGroupId = editingOrder?.batch_group_id ?? crypto.randomUUID()

    const buildPackagingId = (productId: string) => {
      const product = products.find((p) => p.id === productId)
      return product?.category === 'single_cake'
        ? (formSingleCakePackaging[productId] || null)
        : null
    }

    const buildOrderHeader = (
      date: string,
      overrides?: {
        cakePackagingId?: string | null
        cakeBrandingId?: string | null
        tubePackagingId?: string | null
      },
    ) => ({
      order_date: date,
      customer_name: formName.trim() || '未命名',
      status: formStatus || '待',
      batch_info: null as string | null,
      batch_group_id: batchGroupId,
      paid: formPaid,
      cake_packaging_id: overrides && 'cakePackagingId' in overrides
        ? overrides.cakePackagingId ?? null
        : (formCakePackaging || null),
      cake_branding_id: overrides && 'cakeBrandingId' in overrides
        ? overrides.cakeBrandingId ?? null
        : (formCakeBranding || null),
      tube_packaging_id: overrides && 'tubePackagingId' in overrides
        ? overrides.tubePackagingId ?? null
        : (formTubePackaging || null),
      single_cake_packaging_id: null,
      single_cake_branding_text: formSingleCakeBranding || null,
    })

    const buildItemRows = (orderId: string, items: Record<string, number>) =>
      Object.entries(items)
        .filter(([, q]) => q > 0)
        .map(([productId, quantity]) => ({
          order_id: orderId,
          product_id: productId,
          quantity,
          packaging_id: buildPackagingId(productId),
        }))

    // 1. 計算 newPool = formItems - sum(splits.items)
    const newPool: Record<string, number> = { ...formItems }
    for (const s of splits) {
      for (const [pid, qty] of Object.entries(s.items)) {
        const left = (newPool[pid] || 0) - qty
        if (left > 0) newPool[pid] = left
        else delete newPool[pid]
      }
    }

    try {
      // 2. 建立分批 + 追加新訂單(都複製當前 form 的非品項欄位、都綁同 batch_group_id)
      //    分批會從原訂單品項池扣減,追加不會
      //    追加訂單可帶 cake/tube packaging/branding override（原訂單該類別未存在時用戶選的新規格）
      type Overrides = {
        cakePackagingId?: string | null
        cakeBrandingId?: string | null
        tubePackagingId?: string | null
      }
      const newOrderInfos: {
        id: string
        date: string
        itemEntries: [string, number][]
        overrides?: Overrides
      }[] = []
      const inserts: {
        date: string
        items: Record<string, number>
        kind: 'split' | 'append'
        overrides?: Overrides
      }[] = [
        ...splits.map((s) => ({ date: s.date, items: s.items, kind: 'split' as const })),
        ...appends.map((a) => ({
          date: a.date,
          items: a.items,
          kind: 'append' as const,
          overrides: {
            cakePackagingId: a.cakePackagingId,
            cakeBrandingId: a.cakeBrandingId,
            tubePackagingId: a.tubePackagingId,
          } satisfies Overrides,
        })),
      ]
      for (const req of inserts) {
        const ins = await supabase
          .from('orders')
          .insert(buildOrderHeader(req.date, req.overrides))
          .select('id')
          .single()
        if (ins.error || !ins.data) {
          throw new Error(`建立${req.kind === 'split' ? '分批' : '追加'}訂單失敗：${ins.error?.message ?? 'no data'}`)
        }
        const newId = ins.data.id
        const rows = buildItemRows(newId, req.items)
        if (rows.length > 0) {
          const ri = await supabase.from('order_items').insert(rows)
          if (ri.error) throw new Error(`寫入${req.kind === 'split' ? '分批' : '追加'}品項失敗：${ri.error.message}`)
        }
        newOrderInfos.push({
          id: newId,
          date: req.date,
          itemEntries: Object.entries(req.items).filter(([, q]) => q > 0),
          overrides: req.overrides,
        })
      }

      // 3. 同步儲存原訂單（用當前 form 全欄位 + newPool 為品項）
      const upd = await supabase.from('orders').update(buildOrderHeader(formDate)).eq('id', editingOrderId)
      if (upd.error) throw new Error(`更新原訂單失敗：${upd.error.message}`)
      const del = await supabase.from('order_items').delete().eq('order_id', editingOrderId)
      if (del.error) throw new Error(`清除原品項失敗：${del.error.message}`)
      const origRows = buildItemRows(editingOrderId, newPool)
      if (origRows.length > 0) {
        const ri = await supabase.from('order_items').insert(origRows)
        if (ri.error) throw new Error(`寫入原品項失敗：${ri.error.message}`)
      }

      // 4. 抓出整個 batch_group 的訂單（含先前的 split 產生的兄弟訂單），
      //    依日期重排 batch_info = 分批1./2./...,確保多次分批編號一致
      const allInGroup = await supabase
        .from('orders')
        .select('id, order_date')
        .eq('batch_group_id', batchGroupId)
        .order('order_date', { ascending: true })
      if (allInGroup.error) throw new Error(`查詢同群訂單失敗：${allInGroup.error.message}`)
      const sorted = (allInGroup.data || []).slice().sort((a: any, b: any) =>
        (a.order_date as string).localeCompare(b.order_date as string),
      )
      for (let i = 0; i < sorted.length; i++) {
        const ub = await supabase
          .from('orders')
          .update({ batch_info: `分批${i + 1}.` })
          .eq('id', (sorted[i] as any).id)
        if (ub.error) throw new Error(`更新分批編號失敗：${ub.error.message}`)
      }

      // 5. inventory 重算（原訂單 + 各分批訂單）
      const origItemEntries = Object.entries(newPool).filter(([, q]) => q > 0) as [string, number][]
      const { deductions: origIngr, missingTubePkg: missOrig } = calculateDeductions(
        origItemEntries,
        formTubePackaging || undefined,
      )
      const origMat = calculateMaterialDeductions(
        origItemEntries,
        formCakePackaging || undefined,
        formTubePackaging || undefined,
        formSingleCakePackaging,
      )
      await replaceOrderInventory(supabase, editingOrderId, origIngr, origMat.deductions, formDate)

      const allMissingTubePkg = [...missOrig]
      const allMissingCombos = [...origMat.missingCombos]
      for (const info of newOrderInfos) {
        // append 訂單若帶 override 則用之；split 訂單沿用 form 全欄位
        const o = info.overrides
        const cakeForCalc = o && 'cakePackagingId' in o
          ? (o.cakePackagingId || undefined)
          : (formCakePackaging || undefined)
        const tubeForCalc = o && 'tubePackagingId' in o
          ? (o.tubePackagingId || undefined)
          : (formTubePackaging || undefined)
        const { deductions: ingr, missingTubePkg: missN } = calculateDeductions(
          info.itemEntries,
          tubeForCalc,
        )
        const mat = calculateMaterialDeductions(
          info.itemEntries,
          cakeForCalc,
          tubeForCalc,
          formSingleCakePackaging,
        )
        await replaceOrderInventory(supabase, info.id, ingr, mat.deductions, info.date)
        allMissingTubePkg.push(...missN)
        allMissingCombos.push(...mat.missingCombos)
      }
      showInventoryWarnings(allMissingCombos, [...new Set(allMissingTubePkg)])

      // 6. 寫操作紀錄（分批 / 追加 分別 log）
      const customer = formName.trim() || '未命名'
      if (splits.length > 0) {
        await logActivity('分批訂單', `order:${editingOrderId}`, {
          客戶: customer,
          來源日期: formDate,
          分批數: splits.length,
          分批日期: splits.map((s) => s.date).join(', '),
        })
      }
      if (appends.length > 0) {
        await logActivity('追加訂單', `order:${editingOrderId}`, {
          客戶: customer,
          來源日期: formDate,
          追加數: appends.length,
          追加日期: appends.map((a) => a.date).join(', '),
        })
      }

      // 7. 關閉 dialogs + reset + 刷新
      setSplitDialogOpen(false)
      setDialogOpen(false)
      resetForm()
      fetchOrders()
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  // ─── Adjustment handlers ────────────────────────────

  const handleSaveAdjustment = async (value: AdjustmentInput) => {
    try {
      let adjustmentId: string
      if (editingAdjustment) {
        adjustmentId = editingAdjustment.id
        const r1 = await supabase
          .from('stock_adjustments')
          .update({ adjustment_type: value.adjustmentType, note: value.note || null })
          .eq('id', adjustmentId)
        if (r1.error) throw new Error(`更新調整失敗：${r1.error.message}`)
        const r2 = await supabase
          .from('stock_adjustment_items')
          .delete()
          .eq('adjustment_id', adjustmentId)
        if (r2.error) throw new Error(`清除舊扣減項失敗：${r2.error.message}`)
      } else {
        const r = await supabase
          .from('stock_adjustments')
          .insert({
            date: dateStr,
            adjustment_type: value.adjustmentType,
            note: value.note || null,
          })
          .select()
          .single()
        if (r.error || !r.data) throw new Error(`建立調整失敗：${r.error?.message ?? 'no data'}`)
        adjustmentId = r.data.id
      }

      // Insert items
      const itemRows = value.items.map((i) => ({
        adjustment_id: adjustmentId,
        product_id: i.productId,
        quantity: parseFloat(i.quantity),
        deduct_mode: i.deductMode,
        packaging_style_id: i.packagingStyleId || null,
      }))
      const r3 = await supabase.from('stock_adjustment_items').insert(itemRows)
      if (r3.error) throw new Error(`寫入扣減項失敗：${r3.error.message}`)

      // 分類：finished vs ingredient
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

      // 整合 ingredient = direct + finished 透過 recipe 展開 + tube_pkg 特例
      const totalIngredient: Record<string, number> = { ...directDeductions }
      let totalMaterial: Record<string, number> = {}
      const adjMissingTubePkg: string[] = []
      let adjMissingMaterial: { productName: string; packagingName: string | null }[] = []

      if (finishedEntries.length > 0) {
        const ingr = calculateIngredientDeductions(finishedEntries, recipes)
        for (const [k, v] of Object.entries(ingr)) {
          totalIngredient[k] = (totalIngredient[k] || 0) + v
        }

        // tube_pkg 特例：與訂單路徑對齊（散單/試吃選旋轉筒也要扣包裝庫存）
        for (const [productId, qty] of finishedEntries) {
          const product = products.find((p: any) => p.id === productId)
          if (product?.category !== 'tube') continue
          const pkgStyleId = finishedPackaging[productId]
          if (!pkgStyleId) continue
          const pkgName = packagingStyles.find((ps: any) => ps.id === pkgStyleId)?.name
          if (!pkgName) continue
          const tubePkgProduct = products.find((p: any) => p.category === 'tube_pkg' && p.name === pkgName)
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
      showInventoryWarnings(adjMissingMaterial, adjMissingTubePkg)

      // RPC：reverse + apply 為 atomic
      await replaceAdjustmentInventory(supabase, adjustmentId, totalIngredient, totalMaterial, dateStr)

      const typeLabel =
        value.adjustmentType === 'sample' ? '試吃' :
        value.adjustmentType === 'waste' ? '耗損' : '散單'
      await logActivity(
        editingAdjustment ? `編輯${typeLabel}紀錄` : `新增${typeLabel}紀錄`,
        `adjustment:${adjustmentId}`,
        {
          類型: typeLabel,
          日期: dateStr,
          品項數: value.items.length,
        },
      )

      setEditingAdjustment(null)
      fetchAdjustments()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDeleteAdjustment = async (id: string) => {
    if (!confirm('確定刪除此筆試吃/耗損？相關庫存扣減會一併回沖。')) return
    try {
      await deleteAdjustmentWithInventory(supabase, id)
      await logActivity('刪除試吃/耗損/散單紀錄', `adjustment:${id}`, { 日期: dateStr })
      fetchAdjustments()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  const handleEditAdjustment = (a: StockAdjustment & { items: StockAdjustmentItem[] }) => {
    setEditingAdjustment({
      id: a.id,
      value: {
        adjustmentType: a.adjustment_type,
        note: a.note ?? '',
        items: a.items.map((item) => ({
          productId: item.product_id,
          quantity: String(item.quantity),
          deductMode: item.deduct_mode,
          packagingStyleId: item.packaging_style_id ?? '',
        })),
      },
    })
    setAdjustmentDialogOpen(true)
  }

  // ─── Derived data ───────────────────────────────────

  const weekday = format(date, 'EEEE', { locale: zhTW })
  const dateDisplay = format(date, 'yyyy 年 M 月 d 日', { locale: zhTW })

  const cakeProducts = products.filter(p => p.category === 'cake')
  const tubeProducts = products.filter(p => p.category === 'tube')
  const singleCakeProducts = products.filter(p => p.category === 'single_cake')
  const cookieProducts = products.filter(p => p.category === 'cookie')
  const commonCookieProducts = cookieProducts.filter(p => p.is_common)
  const specialCookieProducts = cookieProducts.filter(p => !p.is_common)
  const hasSpecialCookieInForm = specialCookieProducts.some(p => (formItems[p.id] || 0) > 0)
  const visibleCookieProducts = showAllCookies || hasSpecialCookieInForm
    ? cookieProducts
    : commonCookieProducts

  const formHasCake = cakeProducts.some(p => (formItems[p.id] || 0) > 0)
  const formHasTube = tubeProducts.some(p => (formItems[p.id] || 0) > 0)
  const formHasSingle = singleCakeProducts.some(p => (formItems[p.id] || 0) > 0)

  const cakePackagingOptions = packagingStyles.filter((ps: any) => ps.category === 'cake')
  const tubePackagingOptions = packagingStyles.filter((ps: any) => ps.category === 'tube')
  const singleCakePackagingOptions = packagingStyles.filter((ps: any) => ps.category === 'single_cake')

  const pkgName = (id: string) => packagingStyles.find((p: any) => p.id === id)?.name || '選擇'
  const brandName = (id: string) => brandingStyles.find((b: any) => b.id === id)?.name || '選擇'

  const totalOrders = orders.length
  const cakeBoxes = orders.reduce((s, o) => s + o.items.filter(i => i.category === 'cake').reduce((a, i) => a + i.quantity, 0), 0)
  const tubeCount = orders.reduce((s, o) => s + o.items.filter(i => i.category === 'tube').reduce((a, i) => a + i.quantity, 0), 0)
  const singleCount = orders.reduce((s, o) => s + o.items.filter(i => i.category === 'single_cake').reduce((a, i) => a + i.quantity, 0), 0)
  const cookieCount = orders.reduce((s, o) => s + o.items.filter(i => i.category === 'cookie').reduce((a, i) => a + i.quantity, 0), 0)
  const printedCount = orders.filter(o => o.printed).length
  const paidCount = orders.filter(o => o.paid).length

  // ─── Export ──────────────────────────────────────

  const handleExportCSV = () => {
    const BOM = '\uFEFF'
    const headers = ['客戶', '付款', '狀態', '備註', '品項', '包裝', '烙印', '已列印']
    const rows = orders.map(o => {
      const items = o.items.map(i => `${i.name} x${i.quantity}`).join('; ')
      const pkgs = orderMeta(o).join('; ')
      return [
        o.customer_name,
        o.paid ? '已付款' : '未付款',
        o.status,
        o.batch_info || '',
        items,
        pkgs,
        o.cake_branding?.name || o.single_cake_branding_text || '',
        o.printed ? '是' : '否',
      ].map(v => `"${v.replace(/"/g, '""')}"`).join(',')
    })
    const csv = BOM + [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `訂單_${dateStr}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    window.print()
  }

  const orderMeta = (o: OrderRow) => {
    const parts: string[] = []
    if (o.cake_packaging?.name) parts.push(`🍰${o.cake_packaging.name}`)
    if (o.cake_branding?.name) parts.push(`烙:${o.cake_branding.name}`)
    if (o.tube_packaging?.name) parts.push(`🫙${o.tube_packaging.name}`)
    // Per-item single cake packaging
    const singlePkgs = o.items
      .filter(i => i.category === 'single_cake' && i.packagingId)
      .map(i => pkgName(i.packagingId!))
    const uniqueSinglePkgs = [...new Set(singlePkgs)]
    if (uniqueSinglePkgs.length > 0) {
      parts.push(`📦${uniqueSinglePkgs.join('/')}`)
    } else if (o.single_cake_packaging?.name) {
      parts.push(`📦${o.single_cake_packaging.name}`)
    }
    if (o.single_cake_branding_text) parts.push(`字:${o.single_cake_branding_text}`)
    return parts
  }

  return (
    <div>
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push('/calendar')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold text-gray-900">{dateDisplay} ({weekday})</h1>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/calendar/${format(subDays(date, 1), 'yyyy-MM-dd')}`)}>
            <ChevronLeft className="mr-1 h-3 w-3" /> 前一天
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/calendar/${format(addDays(date, 1), 'yyyy-MM-dd')}`)}>
            後一天 <ChevronRight className="ml-1 h-3 w-3" />
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

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">訂單列表 ({orders.length} 筆)</CardTitle>
            <div className="flex gap-2">
              {orders.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExportCSV}>
                  <Download className="mr-1 h-4 w-4" /> 匯出
                </Button>
              )}
              <Button size="sm" onClick={openNewDialog}>
                <Plus className="mr-1 h-4 w-4" /> 新增訂單
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingAdjustment(null)
                  setAdjustmentDialogOpen(true)
                }}
              >
                🍰 今日試吃/耗損/散單
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">印</TableHead>
                    <TableHead className="w-16">付款</TableHead>
                    <TableHead className="w-16 hidden sm:table-cell">狀態</TableHead>
                    <TableHead className="w-20">客戶</TableHead>
                    <TableHead>品項</TableHead>
                    <TableHead className="w-40 hidden md:table-cell">包裝/烙印</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => {
                    const siblings = batchSiblings[order.id] || []
                    return (
                      <Fragment key={order.id}>
                        <TableRow className={order.printed ? 'bg-yellow-100' : ''}>
                          <TableCell>
                            <Checkbox
                              checked={order.printed}
                              onCheckedChange={(checked) => handlePrintedToggle(order.id, !!checked)}
                            />
                          </TableCell>
                          <TableCell>
                            <button
                              type="button"
                              onClick={() => handlePaidToggle(order.id, !order.paid)}
                              className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                                order.paid
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              {order.paid ? '已付款' : '未付款'}
                            </button>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <span className="text-xs">{order.status}</span>
                            {order.batch_info && <div className="text-[10px] text-gray-500">{order.batch_info}</div>}
                            {order.notes && (
                              <div
                                className="text-[10px] text-amber-600 italic mt-0.5"
                                title={`備註：${order.notes}`}
                              >
                                📝 {order.notes}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {order.customer_name}
                            <span className="sm:hidden text-[10px] text-gray-400 block">{order.status}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {order.items.map((item, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs px-1.5 py-0">
                                  {item.name.replace('旋轉筒-', '🫙').replace('單入-', '📦')} x{item.quantity}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {orderMeta(order).map((m, i) => (
                                <Badge key={i} variant="outline" className="text-xs px-1 py-0">{m}</Badge>
                              ))}
                              {orderMeta(order).length === 0 && <span className="text-xs text-gray-300">-</span>}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-400 hover:text-blue-600" onClick={() => openEditDialog(order)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => handleDelete(order.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {siblings.length > 0 && (
                          <TableRow
                            data-testid="batch-siblings-row"
                            className={`hover:bg-transparent ${order.printed ? 'bg-yellow-50' : 'bg-gray-50/40'}`}
                          >
                            <TableCell colSpan={7} className="py-1.5 px-3">
                              <div className="text-xs text-gray-400 leading-relaxed">
                                <span className="text-gray-500 mr-2">↳ 同客戶其他批次:</span>
                                {siblings.map((s, i) => (
                                  <span key={s.orderId} className="inline-flex items-center mr-3">
                                    <button
                                      type="button"
                                      onClick={() => router.push(`/calendar/${s.date}`)}
                                      className="text-gray-600 font-medium hover:text-blue-600 hover:underline"
                                      title={`跳到 ${s.date}`}
                                    >
                                      {format(parseISO(s.date), 'M/d')}
                                    </button>
                                    {s.batch_info && (
                                      <span className="text-gray-400 ml-1">({s.batch_info})</span>
                                    )}
                                    <span className="text-gray-300 mx-1.5">·</span>
                                    {s.items.length === 0 ? (
                                      <span className="text-gray-300">無品項</span>
                                    ) : (
                                      s.items.map((it, j) => (
                                        <span key={j} className="text-gray-500">
                                          {it.name.replace('旋轉筒-', '🫙').replace('單入-', '📦')} x{it.quantity}
                                          {j < s.items.length - 1 && <span className="text-gray-300">, </span>}
                                        </span>
                                      ))
                                    )}
                                    {i < siblings.length - 1 && <span className="text-gray-200 ml-2">|</span>}
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                  {orders.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-gray-400">
                        今天還沒有訂單，點擊「新增訂單」開始
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">當日統計</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">訂單數</span><span className="font-medium">{totalOrders} 筆</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">蛋糕盒</span><span className="font-medium">{cakeBoxes}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">旋轉筒</span><span className="font-medium">{tubeCount}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">單入蛋糕</span><span className="font-medium">{singleCount}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">曲奇</span><span className="font-medium">{cookieCount}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">列印狀態</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <Badge variant="outline" className="border-yellow-400 text-yellow-700 bg-yellow-50">已列印</Badge>
                <span>{printedCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <Badge variant="outline" className="border-gray-300 text-gray-500">未列印</Badge>
                <span>{totalOrders - printedCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">付款狀態</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <Badge variant="outline" className="border-green-400 text-green-700 bg-green-50">已付款</Badge>
                <span>{paidCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <Badge variant="outline" className="border-gray-300 text-gray-500">未付款</Badge>
                <span>{totalOrders - paidCount}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {adjustments.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">今日試吃 / 耗損 / 散單</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {adjustments.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      a.adjustment_type === 'sample'
                        ? 'default'
                        : a.adjustment_type === 'retail'
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {a.adjustment_type === 'sample'
                      ? '試吃'
                      : a.adjustment_type === 'retail'
                        ? '散單'
                        : '耗損'}
                  </Badge>
                  <span className="text-gray-700">
                    {a.items.map((it) => {
                      const product = products.find((p: any) => p.id === it.product_id)
                      const modeLabel = it.deduct_mode === 'finished' ? '成品' : '原料'
                      return `${product?.name ?? '?'} × ${it.quantity} (${modeLabel})`
                    }).join('、')}
                  </span>
                  {a.note && <span className="text-xs text-gray-400">— {a.note}</span>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-xs" onClick={() => handleEditAdjustment(a)}>
                    ✏️
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => handleDeleteAdjustment(a.id)}>
                    🗑️
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Order Dialog (Add / Edit) ── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingOrderId ? '編輯訂單' : '新增訂單'}
              {!editingOrderId && ` — ${dateDisplay}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>訂單日期 *</Label>
                <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Label>客戶姓名 *</Label>
                  {!editingOrderId && duplicateName && (
                    <span className="text-xs font-semibold text-red-600">
                      已存在客戶，請使用分批/追加功能
                    </span>
                  )}
                </div>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="姓名" />
                {!editingOrderId && duplicateName && (
                  <label className="mt-1 flex cursor-pointer items-center gap-1 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={confirmedDifferent}
                      onChange={e => setConfirmedDifferent(e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    <span>非相同客戶（建立獨立訂單）</span>
                  </label>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>付款</Label>
                <Select value={formPaid ? 'paid' : 'unpaid'} onValueChange={(v) => setFormPaid(v === 'paid')}>
                  <SelectTrigger>
                    <SelectValue>{formPaid ? '已付款' : '未付款'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">未付款</SelectItem>
                    <SelectItem value="paid">已付款</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>狀態</Label>
                <Input value={formStatus} onChange={e => setFormStatus(e.target.value)} placeholder="自由輸入" />
              </div>
            </div>
            <div>
              <Label>備註</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSplitDialogOpen(true)}
                  disabled={!editingOrderId}
                  className="shrink-0"
                  title={editingOrderId ? '將品項拆分到其他日期' : '請先儲存訂單後再分批'}
                >
                  分批/追加
                </Button>
                <Input
                  value={formBatch}
                  onChange={e => setFormBatch(e.target.value)}
                  placeholder="e.g. 分批2."
                  className="flex-1"
                />
              </div>
            </div>

            {/* === 蜂蜜蛋糕 === */}
            {cakeProducts.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <Label className="text-sm font-semibold">蜂蜜蛋糕（盒）</Label>
                {cakeProducts.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="text-sm w-40 truncate">{p.name}</span>
                    <Input type="number" min={0} className="w-20" value={formItems[p.id] || ''} onChange={e => setFormItems(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))} placeholder="0" />
                  </div>
                ))}
                {formHasCake && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t mt-2">
                    <div>
                      <Label className="text-xs">烙印款式</Label>
                      <Select value={formCakeBranding || undefined} onValueChange={(v) => v && setFormCakeBranding(v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="選擇">{formCakeBranding ? brandName(formCakeBranding) : undefined}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {brandingStyles.filter((b: any) => b.category === 'cake').map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">包裝款式</Label>
                      <Select value={formCakePackaging || undefined} onValueChange={(v) => v && setFormCakePackaging(v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="選擇">{formCakePackaging ? pkgName(formCakePackaging) : undefined}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {cakePackagingOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* === 旋轉筒 === */}
            {tubeProducts.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <Label className="text-sm font-semibold">旋轉筒</Label>
                {tubeProducts.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="text-sm w-40 truncate">{p.name}</span>
                    <Input type="number" min={0} className="w-20" value={formItems[p.id] || ''} onChange={e => setFormItems(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))} placeholder="0" />
                  </div>
                ))}
                {formHasTube && (
                  <div className="pt-2 border-t mt-2">
                    <Label className="text-xs">包裝款式</Label>
                    <Select value={formTubePackaging || undefined} onValueChange={(v) => v && setFormTubePackaging(v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="選擇">{formTubePackaging ? pkgName(formTubePackaging) : undefined}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {tubePackagingOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* === 單入蛋糕 === */}
            {singleCakeProducts.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <Label className="text-sm font-semibold">單入蛋糕</Label>
                {singleCakeProducts.map(p => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="text-sm w-40 truncate">{p.name}</span>
                    <Input type="number" min={0} className="w-20" value={formItems[p.id] || ''} onChange={e => setFormItems(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))} placeholder="0" />
                  </div>
                ))}
                {formHasSingle && (
                  <div className="space-y-2 pt-2 border-t mt-2">
                    <div>
                      <Label className="text-xs">烙印文字</Label>
                      <Input className="h-8 text-xs" value={formSingleCakeBranding} onChange={e => setFormSingleCakeBranding(e.target.value)} placeholder="自由輸入" />
                    </div>
                    {singleCakeProducts.filter(p => (formItems[p.id] || 0) > 0).map(p => (
                      <div key={p.id}>
                        <Label className="text-xs">{p.name} 包裝款式</Label>
                        <Select
                          value={formSingleCakePackaging[p.id] || undefined}
                          onValueChange={(v) => v && setFormSingleCakePackaging(prev => ({ ...prev, [p.id]: v }))}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="選擇">
                              {formSingleCakePackaging[p.id] ? pkgName(formSingleCakePackaging[p.id]) : undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {singleCakePackagingOptions.map(ps => <SelectItem key={ps.id} value={ps.id}>{ps.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* === 曲奇 === */}
            {cookieProducts.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <Label className="text-sm font-semibold">曲奇</Label>
                <div className="grid grid-cols-2 gap-2">
                  {visibleCookieProducts.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className={`text-sm w-24 truncate ${!p.is_common ? 'text-gray-500' : ''}`}>{p.name}</span>
                      <Input type="number" min={0} className="w-20" value={formItems[p.id] || ''} onChange={e => setFormItems(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))} placeholder="0" />
                    </div>
                  ))}
                </div>
                {specialCookieProducts.length > 0 && !hasSpecialCookieInForm && (
                  <button
                    type="button"
                    onClick={() => setShowAllCookies(s => !s)}
                    className="text-xs text-gray-500 hover:text-gray-900 underline-offset-2 hover:underline"
                  >
                    {showAllCookies ? `− 收合特殊組合（${specialCookieProducts.length}）` : `+ 顯示其他組合（${specialCookieProducts.length}）`}
                  </button>
                )}
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleSaveOrder}
              disabled={
                saving ||
                !formName.trim() ||
                !formDate ||
                (!editingOrderId && duplicateName && !confirmedDifferent)
              }
            >
              {saving ? '儲存中...' : editingOrderId ? '儲存變更' : '新增訂單'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <StockAdjustmentDialog
        open={adjustmentDialogOpen}
        onOpenChange={(open) => {
          setAdjustmentDialogOpen(open)
          if (!open) setEditingAdjustment(null)
        }}
        products={products as import('@/lib/types').Product[]}
        packagingStyles={packagingStyles as import('@/lib/types').PackagingStyle[]}
        initialValue={editingAdjustment?.value}
        onSave={handleSaveAdjustment}
      />

      <SplitOrderDialog
        open={splitDialogOpen}
        onOpenChange={setSplitDialogOpen}
        originalDate={formDate}
        poolItems={formItems}
        appendableProductIds={(() => {
          // 該客戶可追加的品項 = 當前訂單品項 ∪ 同 batch_group 兄弟訂單品項
          const ids = new Set<string>(Object.keys(formItems).filter((pid) => (formItems[pid] || 0) > 0))
          if (editingOrderId) {
            for (const sib of batchSiblings[editingOrderId] || []) {
              for (const it of sib.items) {
                if (it.productId) ids.add(it.productId)
              }
            }
          }
          return [...ids]
        })()}
        cakePackagingStyles={packagingStyles
          .filter((ps: any) => ps.category === 'cake' && ps.is_active)
          .map((ps: any) => ({ id: ps.id, name: ps.name }))}
        cakeBrandingStyles={brandingStyles
          .filter((b: any) => b.category === 'cake' && b.is_active)
          .map((b: any) => ({ id: b.id, name: b.name }))}
        tubePackagingStyles={packagingStyles
          .filter((ps: any) => ps.category === 'tube' && ps.is_active)
          .map((ps: any) => ({ id: ps.id, name: ps.name }))}
        originalCakePackagingId={formCakePackaging || null}
        originalCakeBrandingId={formCakeBranding || null}
        originalTubePackagingId={formTubePackaging || null}
        products={products as import('@/lib/types').Product[]}
        onConfirm={handleSplitConfirm}
      />
    </div>
  )
}
