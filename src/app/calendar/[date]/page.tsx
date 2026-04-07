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

// Category display config
const CATEGORY_LABELS: Record<string, string> = {
  cake: '🍰 蜂蜜蛋糕',
  tube: '🫙 旋轉筒',
  single_cake: '🍰 單入蛋糕',
  cookie: '🍪 曲奇',
}

// Which packaging styles belong to which category
const PACKAGING_CATEGORIES: Record<string, string[]> = {
  cake: ['祝福緞帶(米)', '森林旋律(粉)', '歡樂派對(藍)'],
  tube: ['四季童話', '銀河探險', '旋轉木馬'],
  single_cake: ['愛心', '花園', '小熊'],
}

interface OrderRow {
  id: string
  customer_name: string
  status: string
  batch_info: string | null
  printed: boolean
  packaging_style?: { id: string; name: string } | null
  branding_style?: { id: string; name: string } | null
  items: { name: string; category: string; quantity: number }[]
  notes: string | null
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
  const [formStatus, setFormStatus] = useState('')
  const [formBatch, setFormBatch] = useState('')
  const [formPackaging, setFormPackaging] = useState('')
  const [formBranding, setFormBranding] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formItems, setFormItems] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select(`
        id, customer_name, status, batch_info, printed, notes,
        packaging_style:packaging_styles(id, name),
        branding_style:branding_styles(id, name),
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
        notes: o.notes,
        packaging_style: o.packaging_style,
        branding_style: o.branding_style,
        items: (o.order_items || [])
          .filter((i: any) => i.quantity > 0)
          .map((i: any) => ({
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
  }, [fetchOrders])

  const resetForm = () => {
    setFormName('')
    setFormStatus('')
    setFormBatch('')
    setFormPackaging('')
    setFormBranding('')
    setFormNotes('')
    setFormItems({})
  }

  const handleAddOrder = async () => {
    if (!formName.trim()) return
    setSaving(true)

    const { data: order } = await supabase
      .from('orders')
      .insert({
        order_date: dateStr,
        customer_name: formName.trim(),
        status: formStatus || '待',
        batch_info: formBatch || null,
        packaging_id: formPackaging || null,
        branding_id: formBranding || null,
        notes: formNotes || null,
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

    resetForm()
    setDialogOpen(false)
    setSaving(false)
    fetchOrders()
  }

  const handleDelete = async (orderId: string) => {
    if (!confirm('確定要刪除這筆訂單嗎？')) return
    await supabase.from('orders').delete().eq('id', orderId)
    fetchOrders()
  }

  const handlePrintedToggle = async (orderId: string, printed: boolean) => {
    await supabase.from('orders').update({ printed }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, printed } : o))
  }

  const weekday = format(date, 'EEEE', { locale: zhTW })
  const dateDisplay = format(date, 'yyyy 年 M 月 d 日', { locale: zhTW })

  // Group products by category for the form
  const cakeProducts = products.filter(p => p.category === 'cake')
  const tubeProducts = products.filter(p => p.category === 'tube')
  const singleCakeProducts = products.filter(p => p.category === 'single_cake')
  const cookieProducts = products.filter(p => p.category === 'cookie')

  // Determine which categories have items in the form (for packaging/branding filtering)
  const formHasCake = cakeProducts.some(p => (formItems[p.id] || 0) > 0)
  const formHasTube = tubeProducts.some(p => (formItems[p.id] || 0) > 0)
  const formHasSingle = singleCakeProducts.some(p => (formItems[p.id] || 0) > 0)

  // Filter packaging based on what's in the order
  const availablePackaging = packagingStyles.filter(ps => {
    if (formHasCake && PACKAGING_CATEGORIES.cake?.includes(ps.name)) return true
    if (formHasTube && PACKAGING_CATEGORIES.tube?.includes(ps.name)) return true
    if (formHasSingle && PACKAGING_CATEGORIES.single_cake?.includes(ps.name)) return true
    // If nothing selected yet, show all
    if (!formHasCake && !formHasTube && !formHasSingle) return true
    return false
  })

  // Summary stats
  const totalOrders = orders.length
  const cakeBoxes = orders.reduce((sum, o) => sum + o.items.filter(i => i.category === 'cake').reduce((s, i) => s + i.quantity, 0), 0)
  const tubeCount = orders.reduce((sum, o) => sum + o.items.filter(i => i.category === 'tube').reduce((s, i) => s + i.quantity, 0), 0)
  const singleCount = orders.reduce((sum, o) => sum + o.items.filter(i => i.category === 'single_cake').reduce((s, i) => s + i.quantity, 0), 0)
  const cookieCount = orders.reduce((sum, o) => sum + o.items.filter(i => i.category === 'cookie').reduce((s, i) => s + i.quantity, 0), 0)
  const printedCount = orders.filter(o => o.printed).length

  return (
    <div>
      {/* Header */}
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
        {/* Order table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">訂單列表 ({orders.length} 筆)</CardTitle>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> 新增訂單
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">印</TableHead>
                    <TableHead className="w-16">狀態</TableHead>
                    <TableHead className="w-20">客戶</TableHead>
                    <TableHead>品項</TableHead>
                    <TableHead className="w-20">烙印</TableHead>
                    <TableHead className="w-20">包裝</TableHead>
                    <TableHead className="w-10"></TableHead>
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
                      <TableCell>
                        <span className="text-xs">{order.status}</span>
                        {order.batch_info && <div className="text-[10px] text-gray-500">{order.batch_info}</div>}
                      </TableCell>
                      <TableCell className="font-medium">{order.customer_name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {order.items.map((item, idx) => (
                            <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                              {item.name.replace('旋轉筒-', '🫙').replace('單入-', '📦')} x{item.quantity}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{order.branding_style?.name || '-'}</TableCell>
                      <TableCell className="text-xs">{order.packaging_style?.name || '-'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => handleDelete(order.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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

        {/* Sidebar stats */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">當日統計</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">訂單數</span><span className="font-medium">{totalOrders} 筆</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">🍰 蛋糕盒</span><span className="font-medium">{cakeBoxes}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">🫙 旋轉筒</span><span className="font-medium">{tubeCount}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">📦 單入蛋糕</span><span className="font-medium">{singleCount}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">🍪 曲奇</span><span className="font-medium">{cookieCount}</span></div>
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

      {/* Add Order Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>新增訂單 — {dateDisplay}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Customer + Status */}
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

            {/* Cake combos */}
            {cakeProducts.length > 0 && (
              <div>
                <Label className="mb-2 block">🍰 蜂蜜蛋糕（盒）</Label>
                <div className="grid grid-cols-1 gap-2">
                  {cakeProducts.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="text-sm w-40 truncate">{p.name}</span>
                      <Input
                        type="number" min={0} className="w-20"
                        value={formItems[p.id] || ''}
                        onChange={e => setFormItems(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tube */}
            {tubeProducts.length > 0 && (
              <div>
                <Label className="mb-2 block">🫙 旋轉筒</Label>
                <div className="grid grid-cols-1 gap-2">
                  {tubeProducts.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="text-sm w-40 truncate">{p.name}</span>
                      <Input
                        type="number" min={0} className="w-20"
                        value={formItems[p.id] || ''}
                        onChange={e => setFormItems(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Single cake */}
            {singleCakeProducts.length > 0 && (
              <div>
                <Label className="mb-2 block">📦 單入蛋糕</Label>
                <div className="grid grid-cols-1 gap-2">
                  {singleCakeProducts.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="text-sm w-40 truncate">{p.name}</span>
                      <Input
                        type="number" min={0} className="w-20"
                        value={formItems[p.id] || ''}
                        onChange={e => setFormItems(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cookie */}
            {cookieProducts.length > 0 && (
              <div>
                <Label className="mb-2 block">🍪 曲奇</Label>
                <div className="grid grid-cols-2 gap-2">
                  {cookieProducts.map(p => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="text-sm w-24 truncate">{p.name}</span>
                      <Input
                        type="number" min={0} className="w-20"
                        value={formItems[p.id] || ''}
                        onChange={e => setFormItems(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Branding — only enabled when cake has quantities */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>烙印款式 {!formHasCake && <span className="text-xs text-gray-400">（需選蛋糕）</span>}</Label>
                <Select
                  value={formBranding}
                  onValueChange={(v) => v && setFormBranding(v)}
                  disabled={!formHasCake}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="選擇">
                      {formBranding ? brandingStyles.find(b => b.id === formBranding)?.name || '選擇' : '選擇'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {brandingStyles.map(b => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>包裝款式</Label>
                <Select value={formPackaging} onValueChange={(v) => v && setFormPackaging(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="選擇">
                      {formPackaging ? packagingStyles.find(p => p.id === formPackaging)?.name || '選擇' : '選擇'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availablePackaging.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button className="w-full" onClick={handleAddOrder} disabled={saving || !formName.trim()}>
              {saving ? '儲存中...' : '新增訂單'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
