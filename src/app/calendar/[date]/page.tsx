'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { format, parseISO, addDays, subDays } from 'date-fns'
import { zhTW } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, ArrowLeft, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const STATUS_OPTIONS = ['待', '寄出', '自取', '送', '豐原', '到', '取', '延']
const PAYMENT_OPTIONS = [
  { value: 'unpaid', label: '未付款', color: 'bg-amber-100' },
  { value: 'paid_printed', label: '已付已印單', color: 'bg-yellow-200' },
  { value: 'paid', label: '已付款', color: 'bg-white' },
]

interface OrderRow {
  id: string
  customer_name: string
  status: string
  batch_info: string | null
  payment_status: string
  packaging_style?: { id: string; name: string } | null
  branding_style?: { id: string; name: string } | null
  items: Record<string, number>
  cake_boxes: number
  cookie_boxes: number
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

  // Form state
  const [formName, setFormName] = useState('')
  const [formStatus, setFormStatus] = useState('待')
  const [formBatch, setFormBatch] = useState('')
  const [formPackaging, setFormPackaging] = useState('')
  const [formBranding, setFormBranding] = useState('')
  const [formItems, setFormItems] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select(`
        id, customer_name, status, batch_info, payment_status,
        packaging_style:packaging_styles(id, name),
        branding_style:branding_styles(id, name),
        order_items(quantity, product:products(id, name, category))
      `)
      .eq('order_date', dateStr)
      .order('created_at', { ascending: true })

    if (data) {
      const rows: OrderRow[] = data.map((o: any) => {
        const items: Record<string, number> = {}
        let cakes = 0, cookies = 0
        for (const item of (o.order_items || [])) {
          if (item.product) {
            items[item.product.name] = item.quantity
            if (item.product.category === 'cake') cakes += item.quantity
            if (item.product.category === 'cookie') cookies += item.quantity
          }
        }
        return {
          id: o.id,
          customer_name: o.customer_name,
          status: o.status,
          batch_info: o.batch_info,
          payment_status: o.payment_status,
          packaging_style: o.packaging_style,
          branding_style: o.branding_style,
          items,
          cake_boxes: Math.ceil(cakes / 2),
          cookie_boxes: cookies,
        }
      })
      setOrders(rows)
    }
    setLoading(false)
  }, [dateStr])

  useEffect(() => {
    fetchOrders()
    // Load reference data
    supabase.from('products').select('*').eq('is_active', true).order('sort_order').then(({ data }) => {
      if (data) setProducts(data)
    })
    supabase.from('packaging_styles').select('*').eq('is_active', true).then(({ data }) => {
      if (data) setPackagingStyles(data)
    })
    supabase.from('branding_styles').select('*').eq('is_active', true).then(({ data }) => {
      if (data) setBrandingStyles(data)
    })
  }, [fetchOrders])

  const handleAddOrder = async () => {
    if (!formName.trim()) return
    setSaving(true)

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        order_date: dateStr,
        customer_name: formName.trim(),
        status: formStatus,
        batch_info: formBatch || null,
        packaging_id: formPackaging || null,
        branding_id: formBranding || null,
      })
      .select('id')
      .single()

    if (order) {
      const itemRows = Object.entries(formItems)
        .filter(([_, qty]) => qty > 0)
        .map(([productId, quantity]) => ({
          order_id: order.id,
          product_id: productId,
          quantity,
        }))
      if (itemRows.length > 0) {
        await supabase.from('order_items').insert(itemRows)
      }
    }

    // Reset form
    setFormName('')
    setFormStatus('待')
    setFormBatch('')
    setFormPackaging('')
    setFormBranding('')
    setFormItems({})
    setDialogOpen(false)
    setSaving(false)
    fetchOrders()
  }

  const handleDelete = async (orderId: string) => {
    if (!confirm('確定要刪除這筆訂單嗎？')) return
    await supabase.from('orders').delete().eq('id', orderId)
    fetchOrders()
  }

  const handlePaymentChange = async (orderId: string, status: string) => {
    await supabase.from('orders').update({ payment_status: status }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, payment_status: status } : o))
  }

  const weekday = format(date, 'EEEE', { locale: zhTW })
  const dateDisplay = format(date, 'yyyy 年 M 月 d 日', { locale: zhTW })
  const totalCakes = orders.reduce((s, o) => s + o.cake_boxes, 0)
  const totalCookies = orders.reduce((s, o) => s + o.cookie_boxes, 0)
  const pendingCount = orders.filter(o => ['待', '延'].includes(o.status)).length
  const shippedCount = orders.filter(o => ['寄出', '自取', '送', '到', '取', '豐原'].includes(o.status)).length

  const cakeProducts = products.filter(p => p.category === 'cake')
  const cookieProducts = products.filter(p => p.category === 'cookie')

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
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> 新增訂單
              </Button>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>新增訂單 — {dateDisplay}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>客戶姓名 *</Label>
                      <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="姓名" />
                    </div>
                    <div>
                      <Label>狀態</Label>
                      <Select value={formStatus} onValueChange={(v) => v && setFormStatus(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>備註（分批/追加）</Label>
                    <Input value={formBatch} onChange={e => setFormBatch(e.target.value)} placeholder="e.g. 分批2." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>包裝款式</Label>
                      <Select value={formPackaging} onValueChange={(v) => v && setFormPackaging(v)}>
                        <SelectTrigger><SelectValue placeholder="選擇" /></SelectTrigger>
                        <SelectContent>
                          {packagingStyles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>烙印款式</Label>
                      <Select value={formBranding} onValueChange={(v) => v && setFormBranding(v)}>
                        <SelectTrigger><SelectValue placeholder="選擇" /></SelectTrigger>
                        <SelectContent>
                          {brandingStyles.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {cakeProducts.length > 0 && (
                    <div>
                      <Label className="mb-2 block">🍰 蛋糕數量</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {cakeProducts.map(p => (
                          <div key={p.id}>
                            <Label className="text-xs">{p.name}</Label>
                            <Input
                              type="number" min={0}
                              value={formItems[p.id] || ''}
                              onChange={e => setFormItems(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                              placeholder="0"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {cookieProducts.length > 0 && (
                    <div>
                      <Label className="mb-2 block">🍪 曲奇數量</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {cookieProducts.map(p => (
                          <div key={p.id}>
                            <Label className="text-xs">{p.name}</Label>
                            <Input
                              type="number" min={0}
                              value={formItems[p.id] || ''}
                              onChange={e => setFormItems(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                              placeholder="0"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button className="w-full" onClick={handleAddOrder} disabled={saving || !formName.trim()}>
                    {saving ? '儲存中...' : '新增訂單'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">狀態</TableHead>
                    <TableHead className="w-20">客戶</TableHead>
                    {cakeProducts.map(p => (
                      <TableHead key={p.id} className="w-14 text-center">{p.name}</TableHead>
                    ))}
                    <TableHead className="w-16 text-center">蛋糕盒</TableHead>
                    <TableHead className="w-16 text-center">曲奇盒</TableHead>
                    <TableHead className="w-20">烙印</TableHead>
                    <TableHead className="w-20">包裝</TableHead>
                    <TableHead className="w-24">付款</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => {
                    const paymentColor = PAYMENT_OPTIONS.find(p => p.value === order.payment_status)?.color || ''
                    return (
                      <TableRow key={order.id} className={paymentColor}>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{order.status}</Badge>
                          {order.batch_info && <div className="mt-0.5 text-[10px] text-gray-500">{order.batch_info}</div>}
                        </TableCell>
                        <TableCell className="font-medium">{order.customer_name}</TableCell>
                        {cakeProducts.map(p => (
                          <TableCell key={p.id} className="text-center">{order.items[p.name] || '-'}</TableCell>
                        ))}
                        <TableCell className="text-center font-medium">{order.cake_boxes}</TableCell>
                        <TableCell className="text-center font-medium">{order.cookie_boxes}</TableCell>
                        <TableCell className="text-xs">{order.branding_style?.name || '-'}</TableCell>
                        <TableCell className="text-xs">{order.packaging_style?.name || '-'}</TableCell>
                        <TableCell>
                          <Select value={order.payment_status} onValueChange={(v) => v && handlePaymentChange(order.id, v)}>
                            <SelectTrigger className="h-7 text-xs w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PAYMENT_OPTIONS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => handleDelete(order.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {orders.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={10} className="py-8 text-center text-gray-400">
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
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-gray-500">訂單數</span><span className="font-medium">{orders.length} 筆</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">🍰 蛋糕盒數</span><span className="font-medium">{totalCakes}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">🍪 曲奇盒數</span><span className="font-medium">{totalCookies}</span></div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">出貨狀態</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <Badge variant="outline" className="border-green-300 text-green-700">已出貨</Badge>
                <span>{shippedCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <Badge variant="outline" className="border-orange-300 text-orange-700">待處理</Badge>
                <span>{pendingCount}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
