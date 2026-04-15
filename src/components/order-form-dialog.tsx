'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

function extractFlavors(name: string, category: string): string[] {
  if (category === 'cake') return name.split('+').map(s => s.trim())
  if (category === 'tube' || category === 'single_cake') {
    const idx = name.indexOf('-')
    return idx >= 0 ? [name.slice(idx + 1).trim()] : []
  }
  return []
}

export interface EditingOrder {
  id: string
  order_date: string
  customer_name: string
  status: string
  batch_info: string | null
  cake_packaging_id: string | null
  cake_branding_id: string | null
  tube_packaging_id: string | null
  single_cake_packaging_id: string | null
  single_cake_branding_text: string | null
  items: {
    productId: string
    category: string
    quantity: number
    packagingId?: string | null
  }[]
}

interface OrderFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate: string
  editingOrder?: EditingOrder | null
  allowDateChange?: boolean
  onSaved?: () => void
  onWarning?: (message: string) => void
}

export function OrderFormDialog({
  open,
  onOpenChange,
  initialDate,
  editingOrder,
  allowDateChange = false,
  onSaved,
  onWarning,
}: OrderFormDialogProps) {
  const supabase = createClient()

  const [products, setProducts] = useState<any[]>([])
  const [packagingStyles, setPackagingStyles] = useState<any[]>([])
  const [brandingStyles, setBrandingStyles] = useState<any[]>([])
  const [materialUsages, setMaterialUsages] = useState<
    { product_id: string; material_id: string; packaging_style_id: string | null; quantity_per_unit: number }[]
  >([])

  const [formDate, setFormDate] = useState(initialDate)
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

  // Fetch reference data once
  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packaging_styles').select('*').eq('is_active', true),
      supabase.from('branding_styles').select('*').eq('is_active', true),
      supabase.from('product_material_usage').select('product_id, material_id, packaging_style_id, quantity_per_unit'),
    ]).then(([pr, pk, br, mu]) => {
      if (pr.data) setProducts(pr.data)
      if (pk.data) setPackagingStyles(pk.data)
      if (br.data) setBrandingStyles(br.data)
      if (mu.data) setMaterialUsages(mu.data)
    })
  }, [])

  // Reset / load form when opening
  useEffect(() => {
    if (!open) return
    if (editingOrder) {
      setFormDate(editingOrder.order_date)
      setFormName(editingOrder.customer_name)
      setFormStatus(editingOrder.status)
      setFormBatch(editingOrder.batch_info || '')
      const items: Record<string, number> = {}
      for (const i of editingOrder.items) items[i.productId] = i.quantity
      setFormItems(items)
      setFormCakePackaging(editingOrder.cake_packaging_id || '')
      setFormCakeBranding(editingOrder.cake_branding_id || '')
      setFormTubePackaging(editingOrder.tube_packaging_id || '')
      const singlePkgMap: Record<string, string> = {}
      for (const i of editingOrder.items) {
        if (i.category === 'single_cake' && i.packagingId) singlePkgMap[i.productId] = i.packagingId
      }
      if (Object.keys(singlePkgMap).length === 0 && editingOrder.single_cake_packaging_id) {
        for (const i of editingOrder.items) {
          if (i.category === 'single_cake') singlePkgMap[i.productId] = editingOrder.single_cake_packaging_id!
        }
      }
      setFormSingleCakePackaging(singlePkgMap)
      setFormSingleCakeBranding(editingOrder.single_cake_branding_text || '')
    } else {
      setFormDate(initialDate)
      setFormName(''); setFormStatus(''); setFormBatch('')
      setFormItems({})
      setFormCakePackaging(''); setFormCakeBranding('')
      setFormTubePackaging('')
      setFormSingleCakePackaging({}); setFormSingleCakeBranding('')
    }
  }, [open, editingOrder, initialDate])

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

  const calculateDeductions = (itemEntries: [string, number][], tubePackagingId?: string) => {
    const cakeBarProducts = products.filter(p => p.category === 'cake_bar')
    const tubePkgProducts = products.filter(p => p.category === 'tube_pkg')
    const deductions: Record<string, number> = {}
    let totalTubes = 0

    for (const [productId, qty] of itemEntries) {
      if (qty <= 0) continue
      const product = products.find((p: any) => p.id === productId)
      if (!product) continue
      if (product.category === 'cake' || product.category === 'single_cake') {
        const flavors = extractFlavors(product.name, product.category)
        const barPerUnit = product.category === 'cake' ? 2 / flavors.length : 0.25
        for (const flavor of flavors) {
          const bar = cakeBarProducts.find((b: any) => b.name.includes(flavor))
          if (bar) deductions[bar.id] = (deductions[bar.id] || 0) + qty * barPerUnit
        }
      }
      if (product.category === 'tube') {
        totalTubes += qty
        const flavors = extractFlavors(product.name, product.category)
        for (const flavor of flavors) {
          const bar = cakeBarProducts.find((b: any) => b.name.includes(flavor))
          if (bar) deductions[bar.id] = (deductions[bar.id] || 0) + qty
        }
      }
    }

    if (tubePackagingId && totalTubes > 0) {
      const pkgStyleName = packagingStyles.find(ps => ps.id === tubePackagingId)?.name
      if (pkgStyleName) {
        const tubePkg = tubePkgProducts.find(p => p.name === pkgStyleName)
        if (tubePkg) deductions[tubePkg.id] = (deductions[tubePkg.id] || 0) + totalTubes
      }
    }

    return deductions
  }

  const calculateMaterialDeductions = (
    itemEntries: [string, number][],
    orderCakePackagingId?: string,
    orderTubePackagingId?: string,
    singleCakePackagingMap?: Record<string, string>,
  ) => {
    const deductions: Record<string, number> = {}
    const missingCombos: { productName: string; packagingName: string | null }[] = []

    for (const [productId, qty] of itemEntries) {
      if (qty <= 0) continue
      const product = products.find((p: any) => p.id === productId)
      if (!product) continue
      if (product.category === 'cake_bar' || product.category === 'tube_pkg') continue

      let pkgStyleId: string | undefined
      if (product.category === 'cake') pkgStyleId = orderCakePackagingId
      else if (product.category === 'tube') pkgStyleId = orderTubePackagingId
      else if (product.category === 'single_cake') pkgStyleId = singleCakePackagingMap?.[productId]

      const matched = materialUsages.filter(
        u => u.product_id === productId
          && (u.packaging_style_id === (pkgStyleId || null) || u.packaging_style_id === null),
      )

      if (matched.length === 0) {
        const pkgNm = pkgStyleId ? packagingStyles.find(ps => ps.id === pkgStyleId)?.name ?? null : null
        missingCombos.push({ productName: product.name, packagingName: pkgNm })
      }
      for (const usage of matched) {
        deductions[usage.material_id] = (deductions[usage.material_id] || 0) + qty * usage.quantity_per_unit
      }
    }

    return { deductions, missingCombos }
  }

  const handleSave = async () => {
    if (!formName.trim() || !formDate) return
    setSaving(true)

    const orderData = {
      order_date: formDate,
      customer_name: formName.trim(),
      status: formStatus || '待',
      batch_info: formBatch || null,
      cake_packaging_id: formCakePackaging || null,
      cake_branding_id: formCakeBranding || null,
      tube_packaging_id: formTubePackaging || null,
      single_cake_packaging_id: null,
      single_cake_branding_text: formSingleCakeBranding || null,
    }

    const itemEntries = Object.entries(formItems).filter(([, qty]) => qty > 0)
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

    let orderId: string
    if (editingOrder) {
      await supabase.from('orders').update(orderData).eq('id', editingOrder.id)
      await supabase.from('order_items').delete().eq('order_id', editingOrder.id)
      if (itemEntries.length > 0) await supabase.from('order_items').insert(buildItemRows(editingOrder.id))
      orderId = editingOrder.id
      await supabase.from('inventory').delete().eq('reference_note', `order:${orderId}`)
      await supabase.from('packaging_material_inventory').delete().eq('reference_note', `order:${orderId}`)
    } else {
      const { data: order } = await supabase.from('orders').insert(orderData).select('id').single()
      if (!order) { setSaving(false); return }
      orderId = order.id
      if (itemEntries.length > 0) await supabase.from('order_items').insert(buildItemRows(orderId))
    }

    const invDeductions = calculateDeductions(itemEntries, formTubePackaging || undefined)
    const invRecords = Object.entries(invDeductions)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => ({
        product_id: productId,
        type: 'outbound' as const,
        quantity: -qty,
        reference_note: `order:${orderId}`,
      }))
    if (invRecords.length > 0) await supabase.from('inventory').insert(invRecords)

    const matResult = calculateMaterialDeductions(
      itemEntries,
      formCakePackaging || undefined,
      formTubePackaging || undefined,
      formSingleCakePackaging,
    )
    const matRecords = Object.entries(matResult.deductions)
      .filter(([, qty]) => qty > 0)
      .map(([materialId, qty]) => ({
        material_id: materialId,
        type: 'outbound' as const,
        quantity: -Math.round(qty * 100) / 100,
        reference_note: `order:${orderId}`,
      }))
    if (matRecords.length > 0) await supabase.from('packaging_material_inventory').insert(matRecords)

    if (matResult.missingCombos.length > 0 && onWarning) {
      const lines = matResult.missingCombos.map(
        c => `· ${c.productName}${c.packagingName ? ` — ${c.packagingName}` : ''}`,
      )
      onWarning(`以下組合尚未設定包材對照，未扣減包材：\n${lines.join('\n')}`)
    }

    setSaving(false)
    onOpenChange(false)
    onSaved?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingOrder ? '編輯訂單' : '新增訂單'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>日期 {allowDateChange && '*'}</Label>
              <Input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                disabled={!allowDateChange}
              />
            </div>
            <div>
              <Label>客戶姓名 *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="姓名" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>狀態</Label>
              <Input value={formStatus} onChange={e => setFormStatus(e.target.value)} placeholder="自由輸入" />
            </div>
            <div>
              <Label>備註（分批/追加）</Label>
              <Input value={formBatch} onChange={e => setFormBatch(e.target.value)} placeholder="e.g. 分批2." />
            </div>
          </div>

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

          <Button className="w-full" onClick={handleSave} disabled={saving || !formName.trim() || !formDate}>
            {saving ? '儲存中...' : editingOrder ? '儲存變更' : '新增訂單'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
