'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PlusIcon, XIcon } from 'lucide-react'
import type { Product } from '@/lib/types'

export interface SplitInput {
  date: string
  items: Record<string, number>
}

interface SplitRow {
  rowId: string
  date: string
  items: Record<string, number>
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  originalDate: string
  poolItems: Record<string, number>
  products: Product[]
  onConfirm: (splits: SplitInput[]) => Promise<void>
}

const newRow = (defaultDate: string): SplitRow => ({
  rowId: Math.random().toString(36).slice(2),
  date: defaultDate,
  items: {},
})

export function SplitOrderDialog({
  open, onOpenChange, originalDate, poolItems, products, onConfirm,
}: Props) {
  const [splits, setSplits] = useState<SplitRow[]>([newRow(originalDate)])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setSplits([newRow(originalDate)])
    }
  }, [open, originalDate])

  const poolEntries = useMemo(
    () => Object.entries(poolItems).filter(([, q]) => q > 0),
    [poolItems],
  )
  const poolProducts = useMemo(
    () => poolEntries
      .map(([pid]) => products.find((p) => p.id === pid))
      .filter((p): p is Product => !!p),
    [poolEntries, products],
  )

  const allocated = (productId: string) =>
    splits.reduce((sum, s) => sum + (s.items[productId] || 0), 0)

  const remaining = (productId: string) =>
    (poolItems[productId] || 0) - allocated(productId)

  const updateRow = (rowId: string, patch: Partial<Pick<SplitRow, 'date'>>) =>
    setSplits((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))

  const updateRowItem = (rowId: string, productId: string, qty: number) =>
    setSplits((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r
        const items = { ...r.items }
        if (qty <= 0) delete items[productId]
        else items[productId] = qty
        return { ...r, items }
      }),
    )

  const addRow = () => setSplits((prev) => [...prev, newRow(originalDate)])
  const removeRow = (rowId: string) =>
    setSplits((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.rowId !== rowId)))

  const handleConfirm = async () => {
    const cleaned: SplitInput[] = splits
      .map((s) => ({ date: s.date, items: { ...s.items } }))
      .filter((s) => s.date && Object.values(s.items).some((q) => q > 0))

    if (cleaned.length === 0) {
      alert('請至少新增一筆有日期且有品項的分批')
      return
    }
    for (const productId of Object.keys(poolItems)) {
      if (allocated(productId) > (poolItems[productId] || 0)) {
        const name = products.find((p) => p.id === productId)?.name ?? productId
        alert(`「${name}」分配總和超過原訂單數量`)
        return
      }
    }
    setSaving(true)
    try {
      await onConfirm(cleaned)
      onOpenChange(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`分批失敗：${msg}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden bg-white">
        <DialogHeader>
          <DialogTitle>分批 / 追加訂單</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            將原訂單品項拆分到其他日期。每個分批日期會建立一筆獨立訂單（複製客戶、付款、包裝等資訊），原訂單品項數量自動扣減。所有相關訂單會依日期先後重新標註備註：分批1 / 分批2 / ...
          </p>

          {poolEntries.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-gray-400">
              原訂單沒有可分配的品項
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-gray-50 p-3 space-y-1">
                <div className="text-xs font-semibold text-gray-700 mb-1">原訂單品項池</div>
                {poolProducts.map((p) => {
                  const total = poolItems[p.id] || 0
                  const used = allocated(p.id)
                  const left = total - used
                  return (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700">{p.name}</span>
                      <span className={`font-mono ${left < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                        原 {total} / 已分 {used} / 剩 {left}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-3">
                {splits.map((row, idx) => (
                  <div key={row.rowId} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        分批 {idx + 1}
                      </span>
                      <div className="flex-1">
                        <Input
                          type="date"
                          value={row.date}
                          onChange={(e) => updateRow(row.rowId, { date: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeRow(row.rowId)}
                        disabled={splits.length === 1}
                        className="shrink-0"
                      >
                        <XIcon className="size-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-1">
                      {poolProducts.map((p) => {
                        const max = poolItems[p.id] || 0
                        const value = row.items[p.id] || 0
                        return (
                          <div key={p.id} className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 flex-1 truncate">{p.name}</span>
                            <Input
                              type="number"
                              min={0}
                              max={max}
                              value={value || ''}
                              placeholder="0"
                              onChange={(e) =>
                                updateRowItem(row.rowId, p.id, parseInt(e.target.value) || 0)
                              }
                              className="h-7 w-16 text-sm"
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full">
                  <PlusIcon className="mr-1 size-3" /> 新增分批日期
                </Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={saving || poolEntries.length === 0}>
            {saving ? '處理中...' : '確認分批'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
