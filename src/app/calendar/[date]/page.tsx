'use client'

import { useState, useEffect, useCallback } from 'react'
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

const PACKAGING_CATEGORIES: Record<string, string[]> = {
  cake: ['祝福緞帶(米)', '森林旋律(粉)', '歡樂派對(藍)'],
  tube: ['四季童話', '銀河探險', '旋轉木馬'],
  single_cake: ['愛心', '花園', '小熊'],
}

/** Extract flavor keywords from product name by category */
function extractFlavors(name: string, category: string): string[] {
  if (category === 'cake') return name.split('+').map(s => s.trim())
  if (category === 'tube' || category === 'single_cake') {
    const idx = name.indexOf('-')
    return idx >= 0 ? [name.slice(idx + 1).trim()] : []
  }
  return []
}

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
  items: { productId: string; name: string; category: string; quantity: number }[]
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
  const [formSingleCakePackaging, setFormSingleCakePackaging] = useState('')
  const [formSingleCakeBranding, setFormSingleCakeBranding] = useState('')
  const [saving, setSaving] = useState(false)

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
        order_items(quantity, product:products(id, name, category))
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
          })),
      }))
      setOrders(rows)
    }
    setLoading(false)
  }, [dateStr])

  useEffect(() => {
    fetchOrders()
    supabase.from('products').select('*').eq('is_active', true).order('sort_order').then(({ data }) => {
      if (data) setProducts(data)
    })
    supabase.from('packaging_styles').select('*').eq('is_active', true).then(({ data }) => {
      if (data) setPackagingStyles(data)
    })
    supabase.from('branding_styles').select('*').eq('is_active', true).then(({ data }) => {
      if (data) setBrandingStyles(data)
    })

    // Realtime: auto-refresh when orders change
    const channel = supabase
      .channel(`orders-${dateStr}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `order_date=eq.${dateStr}` }, () => {
        fetchOrders()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        fetchOrders()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchOrders, dateStr])

  // ─── Form helpers ───────────────────────────────────

  const resetForm = () => {
    setFormName(''); setFormStatus(''); setFormBatch('')
    setFormItems({})
    setFormCakePackaging(''); setFormCakeBranding('')
    setFormTubePackaging('')
    setFormSingleCakePackaging(''); setFormSingleCakeBranding('')
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
    setFormSingleCakePackaging(order.single_cake_packaging_id || '')
    setFormSingleCakeBranding(order.single_cake_branding_text || '')
    setDialogOpen(true)
  }

  // ─── Inventory deduction ────────────────────────────

  const calculateDeductions = (itemEntries: [string, number][]) => {
    const cakeBarProducts = products.filter(p => p.category === 'cake_bar')
    const deductions: Record<string, number> = {}

    for (const [productId, qty] of itemEntries) {
      if (qty <= 0) continue
      const product = products.find((p: any) => p.id === productId)
      if (!product) continue

      let barPerUnit = 0
      if (product.category === 'cake') barPerUnit = 1
      else if (product.category === 'tube') barPerUnit = 1
      else if (product.category === 'single_cake') barPerUnit = 0.25
      else continue

      const flavors = extractFlavors(product.name, product.category)
      for (const flavor of flavors) {
        const bar = cakeBarProducts.find((b: any) => b.name.includes(flavor))
        if (bar) {
          deductions[bar.id] = (deductions[bar.id] || 0) + qty * barPerUnit
        }
      }
    }
    return deductions
  }

  const applyDeductions = async (orderId: string, deductions: Record<string, number>) => {
    const records = Object.entries(deductions)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => ({
        product_id: productId,
        type: 'outbound' as const,
        quantity: -qty,
        reference_note: `order:${orderId}`,
      }))
    if (records.length > 0) {
      await supabase.from('inventory').insert(records)
    }
  }

  const reverseDeductions = async (orderId: string) => {
    await supabase.from('inventory').delete().eq('reference_note', `order:${orderId}`)
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
      single_cake_packaging_id: formSingleCakePackaging || null,
      single_cake_branding_text: formSingleCakeBranding || null,
    }

    const itemEntries = Object.entries(formItems).filter(([, qty]) => qty > 0)

    if (editingOrderId) {
      // ── Edit mode ──
      await supabase.from('orders').update(orderData).eq('id', editingOrderId)
      await supabase.from('order_items').delete().eq('order_id', editingOrderId)
      if (itemEntries.length > 0) {
        await supabase.from('order_items').insert(
          itemEntries.map(([productId, quantity]) => ({
            order_id: editingOrderId,
            product_id: productId,
            quantity,
          }))
        )
      }
      await reverseDeductions(editingOrderId)
      const deductions = calculateDeductions(itemEntries)
      await applyDeductions(editingOrderId, deductions)
    } else {
      // ── Add mode ──
      const { data: order } = await supabase
        .from('orders')
        .insert(orderData)
        .select('id')
        .single()

      if (order) {
        if (itemEntries.length > 0) {
          await supabase.from('order_items').insert(
            itemEntries.map(([productId, quantity]) => ({
              order_id: order.id,
              product_id: productId,
              quantity,
            }))
          )
        }
        const deductions = calculateDeductions(itemEntries)
        await applyDeductions(order.id, deductions)
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
    await supabase.from('orders').delete().eq('id', orderId)
    fetchOrders()
  }

  const handlePrintedToggle = async (orderId: string, printed: boolean) => {
    await supabase.from('orders').update({ printed }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, printed } : o))
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

  const cakePackagingOptions = packagingStyles.filter(ps => PACKAGING_CATEGORIES.cake?.includes(ps.name))
  const tubePackagingOptions = packagingStyles.filter(ps => PACKAGING_CATEGORIES.tube?.includes(ps.name))
  const singleCakePackagingOptions = packagingStyles.filter(ps => PACKAGING_CATEGORIES.single_cake?.includes(ps.name))

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
    if (o.single_cake_packaging?.name) parts.push(`📦${o.single_cake_packaging.name}`)
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
                      <Select value={formCakeBranding} onValueChange={(v) => v && setFormCakeBranding(v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="選擇">{formCakeBranding ? brandName(formCakeBranding) : '選擇'}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {brandingStyles.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">包裝款式</Label>
                      <Select value={formCakePackaging} onValueChange={(v) => v && setFormCakePackaging(v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="選擇">{formCakePackaging ? pkgName(formCakePackaging) : '選擇'}</SelectValue>
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
                    <Select value={formTubePackaging} onValueChange={(v) => v && setFormTubePackaging(v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="選擇">{formTubePackaging ? pkgName(formTubePackaging) : '選擇'}</SelectValue>
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
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t mt-2">
                    <div>
                      <Label className="text-xs">烙印文字</Label>
                      <Input className="h-8 text-xs" value={formSingleCakeBranding} onChange={e => setFormSingleCakeBranding(e.target.value)} placeholder="自由輸入" />
                    </div>
                    <div>
                      <Label className="text-xs">包裝款式</Label>
                      <Select value={formSingleCakePackaging} onValueChange={(v) => v && setFormSingleCakePackaging(v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="選擇">{formSingleCakePackaging ? pkgName(formSingleCakePackaging) : '選擇'}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {singleCakePackagingOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
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
    </div>
  )
}
