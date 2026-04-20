'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  applyIngredientDeductions as applyIngredientDeductionsHelper,
  applyMaterialDeductions as applyMaterialDeductionsHelper,
  reverseIngredientDeductions as reverseIngredientDeductionsHelper,
  reverseMaterialDeductions as reverseMaterialDeductionsHelper,
} from '@/lib/stock'
import { StockAdjustmentDialog } from '@/components/stock-adjustment-dialog'
import type { AdjustmentInput } from '@/components/stock-adjustment-dialog'

interface OrderRow {
  id: string
  customer_name: string
  status: string
  batch_info: string | null
  printed: boolean
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
  const [formName, setFormName] = useState('')
  const [formStatus, setFormStatus] = useState('')
  const [formBatch, setFormBatch] = useState('')
  const [formItems, setFormItems] = useState<Record<string, number>>({})
  const [formCakePackaging, setFormCakePackaging] = useState('')
  const [formCakeBranding, setFormCakeBranding] = useState('')
  const [formTubePackaging, setFormTubePackaging] = useState('')
  const [formSingleCakePackaging, setFormSingleCakePackaging] = useState<Record<string, string>>({})
  const [formSingleCakeBranding, setFormSingleCakeBranding] = useState('')
  const [saving, setSaving] = useState(false)

  // Adjustment state
  const [adjustments, setAdjustments] = useState<(StockAdjustment & { items: StockAdjustmentItem[] })[]>([])
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false)
  const [editingAdjustment, setEditingAdjustment] = useState<{
    id: string
    value: AdjustmentInput
  } | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select(`
        id, customer_name, status, batch_info, printed, single_cake_branding_text,
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
        printed: o.printed,
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

  // ─── Form helpers ───────────────────────────────────

  const resetForm = () => {
    setFormName(''); setFormStatus(''); setFormBatch('')
    setFormItems({})
    setFormCakePackaging(''); setFormCakeBranding('')
    setFormTubePackaging('')
    setFormSingleCakePackaging({}); setFormSingleCakeBranding('')
    setEditingOrderId(null)
  }

  const openNewDialog = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEditDialog = (order: OrderRow) => {
    setEditingOrderId(order.id)
    setFormName(order.customer_name)
    setFormStatus(order.status)
    setFormBatch(order.batch_info || '')
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
    // 原料扣減：透過 product_recipe 展開（資料驅動）
    const deductions: Record<string, number> = calculateIngredientDeductions(itemEntries, recipes)

    // tube_pkg 扣減：保留現狀（按訂單 tube_packaging_id 對應包裝款式名稱，扣同名 tube_pkg 產品）
    // 這是 per-packaging 屬性，不在 recipe 內
    let totalTubes = 0
    for (const [productId, qty] of itemEntries) {
      if (qty <= 0) continue
      const product = products.find((p: any) => p.id === productId)
      if (product?.category === 'tube') totalTubes += qty
    }

    if (tubePackagingId && totalTubes > 0) {
      const pkgStyleName = packagingStyles.find((ps) => ps.id === tubePackagingId)?.name
      if (pkgStyleName) {
        const tubePkgProducts = products.filter((p: any) => p.category === 'tube_pkg')
        const tubePkg = tubePkgProducts.find((p: any) => p.name === pkgStyleName)
        if (tubePkg) {
          deductions[tubePkg.id] = (deductions[tubePkg.id] || 0) + totalTubes
        }
      }
    }

    return deductions
  }

  const applyDeductions = async (orderId: string, deductions: Record<string, number>, orderDate: string) => {
    await applyIngredientDeductionsHelper(supabase, deductions, `order:${orderId}`, orderDate)
  }

  const reverseDeductions = async (orderId: string) => {
    await reverseIngredientDeductionsHelper(supabase, `order:${orderId}`)
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

  const applyMaterialDeductions = async (orderId: string, deductions: Record<string, number>, orderDate: string) => {
    await applyMaterialDeductionsHelper(supabase, deductions, `order:${orderId}`, orderDate)
  }

  const reverseMaterialDeductions = async (orderId: string) => {
    await reverseMaterialDeductionsHelper(supabase, `order:${orderId}`)
  }

  const showMaterialWarnings = (combos: { productName: string; packagingName: string | null }[]) => {
    if (combos.length === 0) return
    const lines = combos.map(c =>
      `· ${c.productName}${c.packagingName ? ` — ${c.packagingName}` : ''}`
    )
    setMaterialWarning(`以下組合尚未設定包材對照，未扣減包材：\n${lines.join('\n')}`)
  }

  // ─── Save (add or edit) ─────────────────────────────

  const handleSaveOrder = async () => {
    if (!formName.trim()) return
    setSaving(true)

    const orderData = {
      order_date: dateStr,
      customer_name: formName.trim(),
      status: formStatus || '待',
      batch_info: formBatch || null,
      cake_packaging_id: formCakePackaging || null,
      cake_branding_id: formCakeBranding || null,
      tube_packaging_id: formTubePackaging || null,
      single_cake_packaging_id: null, // per-item packaging now stored in order_items
      single_cake_branding_text: formSingleCakeBranding || null,
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

    if (editingOrderId) {
      // ── Edit mode ──
      await supabase.from('orders').update(orderData).eq('id', editingOrderId)
      await supabase.from('order_items').delete().eq('order_id', editingOrderId)
      if (itemEntries.length > 0) {
        await supabase.from('order_items').insert(buildItemRows(editingOrderId))
      }
      // Product inventory
      await reverseDeductions(editingOrderId)
      const deductions = calculateDeductions(itemEntries, formTubePackaging || undefined)
      await applyDeductions(editingOrderId, deductions, dateStr)
      // Packaging material inventory
      await reverseMaterialDeductions(editingOrderId)
      const matResult = calculateMaterialDeductions(
        itemEntries,
        formCakePackaging || undefined,
        formTubePackaging || undefined,
        formSingleCakePackaging,
      )
      await applyMaterialDeductions(editingOrderId, matResult.deductions, dateStr)
      showMaterialWarnings(matResult.missingCombos)
    } else {
      // ── Add mode ──
      const { data: order } = await supabase
        .from('orders')
        .insert(orderData)
        .select('id')
        .single()

      if (order) {
        if (itemEntries.length > 0) {
          await supabase.from('order_items').insert(buildItemRows(order.id))
        }
        // Product inventory
        const deductions = calculateDeductions(itemEntries, formTubePackaging || undefined)
        await applyDeductions(order.id, deductions, dateStr)
        // Packaging material inventory
        const matResult = calculateMaterialDeductions(
          itemEntries,
          formCakePackaging || undefined,
          formTubePackaging || undefined,
          formSingleCakePackaging,
        )
        await applyMaterialDeductions(order.id, matResult.deductions, dateStr)
        showMaterialWarnings(matResult.missingCombos)
      }
    }

    resetForm()
    setDialogOpen(false)
    setSaving(false)
    fetchOrders()
  }

  const handleDelete = async (orderId: string) => {
    if (!confirm('確定要刪除這筆訂單嗎？')) return
    await reverseDeductions(orderId)
    await reverseMaterialDeductions(orderId)
    await supabase.from('orders').delete().eq('id', orderId)
    fetchOrders()
  }

  const handlePrintedToggle = async (orderId: string, printed: boolean) => {
    await supabase.from('orders').update({ printed }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, printed } : o))
  }

  // ─── Adjustment handlers ────────────────────────────

  const handleSaveAdjustment = async (value: AdjustmentInput) => {
    // 編輯模式：先反轉舊扣減 + 刪舊 items
    if (editingAdjustment) {
      const oldRef = `adjust:${editingAdjustment.id}`
      await reverseIngredientDeductionsHelper(supabase, oldRef)
      await reverseMaterialDeductionsHelper(supabase, oldRef)
      await supabase.from('stock_adjustment_items').delete().eq('adjustment_id', editingAdjustment.id)
      await supabase
        .from('stock_adjustments')
        .update({
          adjustment_type: value.adjustmentType,
          note: value.note || null,
        })
        .eq('id', editingAdjustment.id)
    }

    // 取得 adjustmentId（新增或編輯）
    let adjustmentId: string
    if (editingAdjustment) {
      adjustmentId = editingAdjustment.id
    } else {
      const { data, error } = await supabase
        .from('stock_adjustments')
        .insert({
          date: dateStr,
          adjustment_type: value.adjustmentType,
          note: value.note || null,
        })
        .select()
        .single()
      if (error || !data) throw new Error(error?.message ?? 'insert adjustment failed')
      adjustmentId = data.id
    }

    // Insert items
    const itemRows = value.items.map((i) => ({
      adjustment_id: adjustmentId,
      product_id: i.productId,
      quantity: parseFloat(i.quantity),
      deduct_mode: i.deductMode,
      packaging_style_id: i.packagingStyleId || null,
    }))
    const { error: itemErr } = await supabase.from('stock_adjustment_items').insert(itemRows)
    if (itemErr) throw new Error(itemErr.message)

    // 扣減 inventory
    const referenceNote = `adjust:${adjustmentId}`

    // 分類項目：成品 → 透過 recipe 展開；原料 → 直接聚合扣減
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

    // 原料直接扣減（batched）
    if (Object.keys(directDeductions).length > 0) {
      await applyIngredientDeductionsHelper(supabase, directDeductions, referenceNote, dateStr)
    }

    // 成品透過 recipe 展開扣減
    if (finishedEntries.length > 0) {
      const ingredientDeductions = calculateIngredientDeductions(finishedEntries, recipes)
      await applyIngredientDeductionsHelper(supabase, ingredientDeductions, referenceNote, dateStr)

      const { deductions: materialDeductions } = calcMaterialDeductionsHelper(
        finishedEntries,
        products,
        materialUsages,
        (productId) => finishedPackaging[productId] ?? null,
        (id) => packagingStyles.find((ps) => ps.id === id)?.name ?? null,
      )
      await applyMaterialDeductionsHelper(supabase, materialDeductions, referenceNote, dateStr)
    }

    setEditingAdjustment(null)
    fetchAdjustments()
  }

  const handleDeleteAdjustment = async (id: string) => {
    if (!confirm('確定刪除此筆試吃/耗損？相關庫存扣減會一併回沖。')) return
    await reverseIngredientDeductionsHelper(supabase, `adjust:${id}`)
    await reverseMaterialDeductionsHelper(supabase, `adjust:${id}`)
    await supabase.from('stock_adjustments').delete().eq('id', id)
    fetchAdjustments()
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

  // ─── Export ──────────────────────────────────────

  const handleExportCSV = () => {
    const BOM = '\uFEFF'
    const headers = ['客戶', '狀態', '備註', '品項', '包裝', '烙印', '已列印']
    const rows = orders.map(o => {
      const items = o.items.map(i => `${i.name} x${i.quantity}`).join('; ')
      const pkgs = orderMeta(o).join('; ')
      return [
        o.customer_name,
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
                    <TableHead className="w-16 hidden sm:table-cell">狀態</TableHead>
                    <TableHead className="w-20">客戶</TableHead>
                    <TableHead>品項</TableHead>
                    <TableHead className="w-40 hidden md:table-cell">包裝/烙印</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id} className={order.printed ? 'bg-yellow-100' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={order.printed}
                          onCheckedChange={(checked) => handlePrintedToggle(order.id, !!checked)}
                        />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-xs">{order.status}</span>
                        {order.batch_info && <div className="text-[10px] text-gray-500">{order.batch_info}</div>}
                      </TableCell>
                      <TableCell className="font-medium">
                        {order.customer_name}
                        <span className="sm:hidden text-[10px] text-gray-400 block">{order.status}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {order.items.map((item, idx) => (
                            <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                              {item.name.replace('旋轉筒-', '🫙').replace('單入-', '📦')} x{item.quantity}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {orderMeta(order).map((m, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] px-1 py-0">{m}</Badge>
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
                  ))}
                  {orders.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-gray-400">
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
            <DialogTitle>{editingOrderId ? '編輯訂單' : '新增訂單'} — {dateDisplay}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>客戶姓名 *</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="姓名" />
              </div>
              <div>
                <Label>狀態</Label>
                <Input value={formStatus} onChange={e => setFormStatus(e.target.value)} placeholder="自由輸入" />
              </div>
            </div>
            <div>
              <Label>備註（分批/追加）</Label>
              <Input value={formBatch} onChange={e => setFormBatch(e.target.value)} placeholder="e.g. 分批2." />
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
                  {cookieProducts.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="text-sm w-24 truncate">{p.name}</span>
                      <Input type="number" min={0} className="w-20" value={formItems[p.id] || ''} onChange={e => setFormItems(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))} placeholder="0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button className="w-full" onClick={handleSaveOrder} disabled={saving || !formName.trim()}>
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
    </div>
  )
}
