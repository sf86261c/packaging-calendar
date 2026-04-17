'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PlusIcon, XIcon } from 'lucide-react'
import type { Product, AdjustmentType, DeductMode } from '@/lib/types'

export interface AdjustmentItemInput {
  productId: string
  quantity: string
  deductMode: DeductMode
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
  initialValue?: AdjustmentInput
  onSave: (value: AdjustmentInput) => Promise<void>
}

export function StockAdjustmentDialog({
  open, onOpenChange, products, initialValue, onSave,
}: Props) {
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('sample')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<AdjustmentItemInput[]>([
    { productId: '', quantity: '1', deductMode: 'finished' },
  ])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && initialValue) {
      setAdjustmentType(initialValue.adjustmentType)
      setNote(initialValue.note)
      setItems(initialValue.items.length > 0 ? initialValue.items : [
        { productId: '', quantity: '1', deductMode: 'finished' },
      ])
    } else if (open && !initialValue) {
      setAdjustmentType('sample')
      setNote('')
      setItems([{ productId: '', quantity: '1', deductMode: 'finished' }])
    }
  }, [open, initialValue])

  const addItem = () =>
    setItems((prev) => [...prev, { productId: '', quantity: '1', deductMode: 'finished' }])

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

  const finishedProducts = products.filter(
    (p) => p.is_active && ['cake', 'tube', 'cookie', 'single_cake'].includes(p.category),
  )
  const ingredientProducts = products.filter(
    (p) => p.is_active && ['cake_bar', 'tube_pkg'].includes(p.category),
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>今日試吃 / 耗損</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>類型</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={adjustmentType === 'sample'}
                  onChange={() => setAdjustmentType('sample')}
                />
                試吃
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={adjustmentType === 'waste'}
                  onChange={() => setAdjustmentType('waste')}
                />
                耗損
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
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="radio"
                        checked={row.deductMode === 'finished'}
                        onChange={() => {
                          updateItem(i, 'deductMode', 'finished')
                          updateItem(i, 'productId', '')
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
                        }}
                      />
                      原料
                    </label>
                  </div>
                  <select
                    value={row.productId}
                    onChange={(e) => updateItem(i, 'productId', e.target.value)}
                    className="flex h-8 flex-1 min-w-[120px] rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
                  >
                    <option value="" disabled>選擇產品</option>
                    {productList.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.quantity}
                    onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                    className="h-8 w-20"
                    placeholder="數量"
                  />
                  <Button type="button" variant="ghost" size="icon-xs" onClick={() => removeItem(i)}>
                    <XIcon className="size-3" />
                  </Button>
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
