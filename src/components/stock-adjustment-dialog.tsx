'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PlusIcon, XIcon } from 'lucide-react'
import type { Product, PackagingStyle, AdjustmentType, DeductMode } from '@/lib/types'

export interface AdjustmentItemInput {
  productId: string
  quantity: string
  deductMode: DeductMode
  packagingStyleId?: string
}

export interface AdjustmentInput {
  adjustmentType: AdjustmentType
  note: string
  items: AdjustmentItemInput[]
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
  packagingStyles: PackagingStyle[]
  // 「耗損 + 原料」mode 可選的包材清單（連動扣 packaging_material_inventory）
  // value 規範：在 AdjustmentItemInput.productId 中以 `material:<UUID>` 表示
  materials?: { id: string; name: string }[]
  initialValue?: AdjustmentInput
  onSave: (value: AdjustmentInput) => Promise<void>
}

export function StockAdjustmentDialog({
  open, onOpenChange, products, packagingStyles, materials, initialValue, onSave,
}: Props) {
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('sample')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<AdjustmentItemInput[]>([
    { productId: '', quantity: '1', deductMode: 'finished', packagingStyleId: '' },
  ])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && initialValue) {
      setAdjustmentType(initialValue.adjustmentType)
      setNote(initialValue.note)
      setItems(initialValue.items.length > 0 ? initialValue.items : [
        { productId: '', quantity: '1', deductMode: 'finished', packagingStyleId: '' },
      ])
    } else if (open && !initialValue) {
      setAdjustmentType('sample')
      setNote('')
      setItems([{ productId: '', quantity: '1', deductMode: 'finished', packagingStyleId: '' }])
    }
  }, [open, initialValue])

  const addItem = () =>
    setItems((prev) => [...prev, { productId: '', quantity: '1', deductMode: 'finished', packagingStyleId: '' }])

  const removeItem = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i))

  const updateItem = (i: number, field: keyof AdjustmentItemInput, value: string) =>
    setItems((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)),
    )

  const handleSave = async () => {
    const validItems = items.filter((i) => i.productId && parseFloat(i.quantity) > 0)
    if (validItems.length === 0) {
      alert('請至少新增一個扣減項目')
      return
    }
    setSaving(true)
    try {
      await onSave({ adjustmentType, note, items: validItems })
      onOpenChange(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`儲存失敗：${msg}`)
    } finally {
      setSaving(false)
    }
  }

  // 成品：
  // - 散單：全部活躍的 蜂蜜蛋糕(cake) + 旋轉筒(tube) + 曲奇(cookie)
  // - 試吃 / 耗損：僅列蜂蜜蛋糕試吃(cake 含"試吃")、旋轉筒試吃(tube 含"試吃")、所有曲奇
  const finishedProducts = products.filter((p) => {
    if (!p.is_active) return false
    if (adjustmentType === 'retail') {
      return p.category === 'cake' || p.category === 'tube' || p.category === 'cookie'
    }
    if (p.category === 'cookie') return true
    if ((p.category === 'cake' || p.category === 'tube') && p.name.includes('試吃')) return true
    return false
  })

  // 原料：cake_bar + tube_pkg
  const ingredientProducts = products.filter(
    (p) => p.is_active && ['cake_bar', 'tube_pkg'].includes(p.category),
  )

  const productById = (id: string) => products.find((p) => p.id === id)
  const packagingOptionsForCategory = (cat: string) =>
    packagingStyles.filter((ps) => ps.category === cat && ps.is_active)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-xl max-h-[90vh] overflow-y-auto overflow-x-hidden bg-white">
        <DialogHeader>
          <DialogTitle>今日試吃 / 耗損 / 散單</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>類型</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={adjustmentType === 'sample'}
                  onChange={() => {
                    setAdjustmentType('sample')
                    setItems([{ productId: '', quantity: '1', deductMode: 'finished', packagingStyleId: '' }])
                  }}
                />
                試吃
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={adjustmentType === 'waste'}
                  onChange={() => {
                    setAdjustmentType('waste')
                    setItems([{ productId: '', quantity: '1', deductMode: 'finished', packagingStyleId: '' }])
                  }}
                />
                耗損
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={adjustmentType === 'retail'}
                  onChange={() => {
                    setAdjustmentType('retail')
                    setItems([{ productId: '', quantity: '1', deductMode: 'finished', packagingStyleId: '' }])
                  }}
                />
                散單
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>備註（可選）</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備註" />
          </div>

          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-500">扣減項目</Label>
              <Button type="button" variant="ghost" size="xs" onClick={addItem}>
                <PlusIcon className="size-3" /> 新增項目
              </Button>
            </div>
            {items.map((row, i) => {
              const productList = row.deductMode === 'finished' ? finishedProducts : ingredientProducts
              const isMaterial = row.productId.startsWith('material:')
              const selectedProduct = !isMaterial ? productById(row.productId) : undefined
              const needsPackaging = !isMaterial
                && row.deductMode === 'finished'
                && selectedProduct
                && (selectedProduct.category === 'cake' || selectedProduct.category === 'tube')
              const pkgOptions = selectedProduct ? packagingOptionsForCategory(selectedProduct.category) : []
              const showMaterials = adjustmentType === 'waste'
                && row.deductMode === 'ingredient'
                && (materials?.length ?? 0) > 0
              return (
                <div key={i} className="space-y-1.5 rounded-lg border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex gap-2">
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="radio"
                          checked={row.deductMode === 'finished'}
                          onChange={() => {
                            updateItem(i, 'deductMode', 'finished')
                            updateItem(i, 'productId', '')
                            updateItem(i, 'packagingStyleId', '')
                          }}
                        />
                        成品
                      </label>
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="radio"
                          checked={row.deductMode === 'ingredient'}
                          onChange={() => {
                            updateItem(i, 'deductMode', 'ingredient')
                            updateItem(i, 'productId', '')
                            updateItem(i, 'packagingStyleId', '')
                          }}
                        />
                        原料
                      </label>
                    </div>
                    <div className="flex min-w-0 flex-1 basis-[10rem] items-center gap-1.5">
                      <span className="shrink-0 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {row.deductMode === 'finished' ? '成品' : '原料'}
                      </span>
                      <select
                        value={row.productId}
                        onChange={(e) => {
                          updateItem(i, 'productId', e.target.value)
                          updateItem(i, 'packagingStyleId', '')
                        }}
                        className="flex h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
                      >
                        <option value="" disabled>選擇產品</option>
                        {productList.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                        {showMaterials && (
                          <>
                            <option disabled>──── 包材 ────</option>
                            {materials!.map((m) => (
                              <option key={`m-${m.id}`} value={`material:${m.id}`}>{m.name}（包材）</option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.quantity}
                      onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                      className="h-8 w-20 shrink-0"
                      placeholder="數量"
                    />
                    <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeItem(i)} className="shrink-0">
                      <XIcon className="size-3" />
                    </Button>
                  </div>
                  {needsPackaging && (
                    <div className="flex items-center gap-1.5 pl-1">
                      <span className="shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">款式</span>
                      <select
                        value={row.packagingStyleId ?? ''}
                        onChange={(e) => updateItem(i, 'packagingStyleId', e.target.value)}
                        className="flex h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
                      >
                        <option value="" disabled>選擇包裝款式</option>
                        {pkgOptions.map((ps) => (
                          <option key={ps.id} value={ps.id}>{ps.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? '儲存中...' : '儲存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
