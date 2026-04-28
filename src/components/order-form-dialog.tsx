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
import type { ProductRecipe, ProductMaterialUsage } from '@/lib/types'
import {
  calculateIngredientDeductions,
  calculateMaterialDeductions as calcMaterialDeductionsHelper,
  replaceOrderInventory,
} from '@/lib/stock'
import { logActivity } from '@/lib/activity'

export interface EditingOrder {
  id: string
  order_date: string
  customer_name: string
  status: string
  batch_info: string | null
  paid: boolean
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
  const [materialUsages, setMaterialUsages] = useState<ProductMaterialUsage[]>([])
  const [recipes, setRecipes] = useState<ProductRecipe[]>([])

  const [formDate, setFormDate] = useState(initialDate)
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

  // Fetch reference data once
  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packaging_styles').select('*').eq('is_active', true),
      supabase.from('branding_styles').select('*').eq('is_active', true),
      supabase.from('product_material_usage').select('id, product_id, material_id, packaging_style_id, quantity_per_unit'),
      supabase.from('product_recipe').select('id, product_id, ingredient_id, quantity_per_unit, created_at'),
    ]).then(([pr, pk, br, mu, r]) => {
      if (pr.data) setProducts(pr.data)
      if (pk.data) setPackagingStyles(pk.data)
      if (br.data) setBrandingStyles(br.data)
      if (mu.data) setMaterialUsages(mu.data as ProductMaterialUsage[])
      if (r.data) setRecipes(r.data as ProductRecipe[])
    })
  }, [])

  // Reset / load form when opening
  useEffect(() => {
    if (!open) return
    setShowAllCookies(false)
    if (editingOrder) {
      setFormDate(editingOrder.order_date)
      setFormName(editingOrder.customer_name)
      setFormStatus(editingOrder.status)
      setFormBatch(editingOrder.batch_info || '')
      setFormPaid(!!editingOrder.paid)
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
      setFormPaid(false)
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
      const pkgStyleName = packagingStyles.find(ps => ps.id === tubePackagingId)?.name
      if (pkgStyleName) {
        const tubePkg = products.find((p: any) => p.category === 'tube_pkg' && p.name === pkgStyleName)
        if (tubePkg) {
          deductions[tubePkg.id] = (deductions[tubePkg.id] || 0) + totalTubes
        } else {
          missingTubePkg.push(pkgStyleName)
        }
      }
    }

    return { deductions, missingTubePkg }
  }

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

  const handleSave = async () => {
    if (!formName.trim() || !formDate) return
    setSaving(true)

    const orderData = {
      order_date: formDate,
      customer_name: formName.trim(),
      status: formStatus || '待',
      batch_info: formBatch || null,
      paid: formPaid,
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

    try {
      let orderId: string
      if (editingOrder) {
        const r1 = await supabase.from('orders').update(orderData).eq('id', editingOrder.id)
        if (r1.error) throw new Error(`更新訂單失敗：${r1.error.message}`)
        const r2 = await supabase.from('order_items').delete().eq('order_id', editingOrder.id)
        if (r2.error) throw new Error(`清除舊品項失敗：${r2.error.message}`)
        if (itemEntries.length > 0) {
          const r3 = await supabase.from('order_items').insert(buildItemRows(editingOrder.id))
          if (r3.error) throw new Error(`寫入品項失敗：${r3.error.message}`)
        }
        orderId = editingOrder.id
      } else {
        const r = await supabase.from('orders').insert(orderData).select('id').single()
        if (r.error || !r.data) throw new Error(`建立訂單失敗：${r.error?.message ?? 'no data returned'}`)
        orderId = r.data.id
        if (itemEntries.length > 0) {
          const r2 = await supabase.from('order_items').insert(buildItemRows(orderId))
          if (r2.error) throw new Error(`寫入品項失敗：${r2.error.message}`)
        }
      }

      const { deductions: invDeductions, missingTubePkg } = calculateDeductions(itemEntries, formTubePackaging || undefined)
      const matResult = calculateMaterialDeductions(
        itemEntries,
        formCakePackaging || undefined,
        formTubePackaging || undefined,
        formSingleCakePackaging,
      )

      // RPC：DELETE old + INSERT new 在 server 端為單一 transaction
      await replaceOrderInventory(supabase, orderId, invDeductions, matResult.deductions, formDate)

      // 細化 action：新增 / 改日期 / 改數量 / 改日期+改數量 / 編輯訂單
      let activityAction = '新增訂單'
      const itemsLabel = itemEntries
        .map(([pid, q]) => {
          const product = products.find((p: { id: string; name: string }) => p.id === pid)
          return `${product?.name ?? '?'} ×${q}`
        })
        .join('、')
      const meta: Record<string, unknown> = {
        客戶: orderData.customer_name,
        日期: orderData.order_date,
        付款狀態: orderData.paid ? '已付款' : '未付款',
        品項: itemsLabel || '無品項',
      }
      if (editingOrder) {
        const dateChanged = editingOrder.order_date !== formDate
        const oldItems: Record<string, number> = {}
        for (const i of editingOrder.items) oldItems[i.productId] = i.quantity
        const oldKeys = new Set(Object.keys(oldItems).filter(k => oldItems[k] > 0))
        const newKeys = new Set(Object.keys(formItems).filter(k => formItems[k] > 0))
        let itemsChanged = oldKeys.size !== newKeys.size
        if (!itemsChanged) {
          for (const k of oldKeys) {
            if (!newKeys.has(k) || oldItems[k] !== formItems[k]) {
              itemsChanged = true
              break
            }
          }
        }
        if (dateChanged && itemsChanged) activityAction = '改日期+改數量'
        else if (dateChanged) activityAction = '改日期'
        else if (itemsChanged) activityAction = '改數量'
        else activityAction = '編輯訂單'
        if (dateChanged) meta['原日期'] = editingOrder.order_date
        if (itemsChanged) {
          const oldLabel = Object.entries(oldItems)
            .filter(([, q]) => q > 0)
            .map(([pid, q]) => {
              const product = products.find((p: { id: string; name: string }) => p.id === pid)
              return `${product?.name ?? '?'} ×${q}`
            })
            .join('、')
          if (oldLabel) meta['原品項'] = oldLabel
        }
      }
      await logActivity(activityAction, `order:${orderId}`, meta)

      if (onWarning) {
        const sections: string[] = []
        if (matResult.missingCombos.length > 0) {
          const lines = matResult.missingCombos.map(
            c => `· ${c.productName}${c.packagingName ? ` — ${c.packagingName}` : ''}`,
          )
          sections.push(`以下組合尚未設定包材對照，未扣減包材：\n${lines.join('\n')}`)
        }
        if (missingTubePkg.length > 0) {
          const lines = missingTubePkg.map(n => `· ${n}`)
          sections.push(`以下旋轉筒包裝款式找不到對應的 tube_pkg 產品（已停用或名稱不符），未扣減包裝庫存：\n${lines.join('\n')}`)
        }
        if (sections.length > 0) onWarning(sections.join('\n\n'))
      }

      onOpenChange(false)
      onSaved?.()
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
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
            <Label>備註（分批/追加）</Label>
            <Input value={formBatch} onChange={e => setFormBatch(e.target.value)} placeholder="e.g. 分批2." />
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

          <Button className="w-full" onClick={handleSave} disabled={saving || !formName.trim() || !formDate}>
            {saving ? '儲存中...' : editingOrder ? '儲存變更' : '新增訂單'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
