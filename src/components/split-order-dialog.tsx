'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { PlusIcon, XIcon } from 'lucide-react'
import type { Product } from '@/lib/types'

export interface SplitInput {
  date: string
  items: Record<string, number>
}

export interface AppendInput {
  date: string
  items: Record<string, number>
  // effective tube_packaging_id：原訂單已有旋轉筒則沿用、否則為使用者在追加 dialog 選的新包裝；無旋轉筒品項時為 null
  tubePackagingId?: string | null
}

export interface SplitOrAppendResult {
  splits: SplitInput[]
  appends: AppendInput[]
}

interface SplitRow {
  rowId: string
  date: string
  items: Record<string, number>
}

interface AppendRow {
  rowId: string
  date: string
  items: Record<string, number>
  newTubePackagingId: string  // 使用者選的旋轉筒包裝（僅原訂單沒有旋轉筒時用）
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  originalDate: string
  poolItems: Record<string, number>
  appendableProductIds: string[]
  tubePackagingStyles: { id: string; name: string }[]
  originalTubePackagingId?: string | null  // 原訂單的旋轉筒包裝（用於繼承到追加訂單）
  products: Product[]
  onConfirm: (result: SplitOrAppendResult) => Promise<void>
}

const newRow = (defaultDate: string): SplitRow => ({
  rowId: Math.random().toString(36).slice(2),
  date: defaultDate,
  items: {},
})

const newAppendRow = (defaultDate: string): AppendRow => ({
  rowId: Math.random().toString(36).slice(2),
  date: defaultDate,
  items: {},
  newTubePackagingId: '',
})

export function SplitOrderDialog({
  open, onOpenChange, originalDate, poolItems, appendableProductIds,
  tubePackagingStyles, originalTubePackagingId, products, onConfirm,
}: Props) {
  const [splits, setSplits] = useState<SplitRow[]>([newRow(originalDate)])
  const [appends, setAppends] = useState<AppendRow[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setSplits([newRow(originalDate)])
      setAppends([])
    }
  }, [open, originalDate])

  // ── 分批用品項池(來自原訂單) ──────────────────────
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

  // ── 追加：分類各品項規則 ─────────────────────────
  const appendableSet = useMemo(() => new Set(appendableProductIds), [appendableProductIds])

  const allTubes = useMemo(
    () => products
      .filter((p) => p.category === 'tube' && p.is_active)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [products],
  )
  const allCookies = useMemo(
    () => products
      .filter((p) => p.category === 'cookie' && p.is_active)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [products],
  )

  const existingCakes = useMemo(
    () => products
      .filter((p) => p.category === 'cake' && p.is_active && appendableSet.has(p.id))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [products, appendableSet],
  )
  const existingTubes = useMemo(
    () => allTubes.filter((p) => appendableSet.has(p.id)),
    [allTubes, appendableSet],
  )
  const existingSingleCakes = useMemo(
    () => products
      .filter((p) => p.category === 'single_cake' && p.is_active && appendableSet.has(p.id))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [products, appendableSet],
  )
  const existingCookies = useMemo(
    () => allCookies.filter((p) => appendableSet.has(p.id)),
    [allCookies, appendableSet],
  )

  const hasExistingCake = existingCakes.length > 0
  const hasExistingTube = existingTubes.length > 0
  const hasExistingSingleCake = existingSingleCakes.length > 0
  const hasExistingCookie = existingCookies.length > 0

  const tubePkgName = (id: string) => tubePackagingStyles.find((p) => p.id === id)?.name ?? ''

  // ── Split row helpers ────────────────────────────
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

  // ── Append row helpers ───────────────────────────
  const updateAppendRow = (rowId: string, patch: Partial<Pick<AppendRow, 'date' | 'newTubePackagingId'>>) =>
    setAppends((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))

  const updateAppendItem = (rowId: string, productId: string, qty: number) =>
    setAppends((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r
        const items = { ...r.items }
        if (qty <= 0) delete items[productId]
        else items[productId] = qty
        return { ...r, items }
      }),
    )

  const addAppendRow = () => setAppends((prev) => [...prev, newAppendRow(originalDate)])
  const removeAppendRow = (rowId: string) =>
    setAppends((prev) => prev.filter((r) => r.rowId !== rowId))

  // ── Confirm ──────────────────────────────────────
  const handleConfirm = async () => {
    const cleanedSplits: SplitInput[] = splits
      .map((s) => ({ date: s.date, items: { ...s.items } }))
      .filter((s) => s.date && Object.values(s.items).some((q) => q > 0))

    const cleanedAppends: AppendInput[] = appends
      .map((a) => {
        const items = { ...a.items }
        const tubeItemIds = Object.keys(items).filter(
          (pid) => allTubes.some((t) => t.id === pid) && (items[pid] || 0) > 0,
        )
        let tubePackagingId: string | null = null
        if (tubeItemIds.length > 0) {
          tubePackagingId = hasExistingTube
            ? (originalTubePackagingId || null)
            : (a.newTubePackagingId || null)
        }
        return { date: a.date, items, tubePackagingId }
      })
      .filter((a) => a.date && Object.values(a.items).some((q) => q > 0))

    if (cleanedSplits.length === 0 && cleanedAppends.length === 0) {
      alert('請至少新增一筆有日期且有品項的分批或追加')
      return
    }

    // 分批超量檢查
    for (const productId of Object.keys(poolItems)) {
      if (allocated(productId) > (poolItems[productId] || 0)) {
        const name = products.find((p) => p.id === productId)?.name ?? productId
        alert(`「${name}」分批分配總和超過原訂單數量`)
        return
      }
    }

    // 追加品項規則檢查
    for (const a of cleanedAppends) {
      const tubeItemIds = Object.keys(a.items).filter(
        (pid) => allTubes.some((t) => t.id === pid) && (a.items[pid] || 0) > 0,
      )
      // 原訂單沒有旋轉筒：每筆追加只能選一種口味、且必須選包裝
      if (!hasExistingTube) {
        if (tubeItemIds.length > 1) {
          alert('原訂單沒有旋轉筒，每筆追加只能選一種旋轉筒口味')
          return
        }
        if (tubeItemIds.length > 0 && !a.tubePackagingId) {
          alert('追加新口味旋轉筒時必須選擇包裝款式')
          return
        }
      }
      // 各品項類別合法性：cake/single_cake 僅可追加原口味
      for (const pid of Object.keys(a.items)) {
        if ((a.items[pid] || 0) <= 0) continue
        const product = products.find((p) => p.id === pid)
        if (!product) continue
        const isExistingItem = appendableSet.has(pid)
        if ((product.category === 'cake' || product.category === 'single_cake') && !isExistingItem) {
          alert(`「${product.name}」無法追加：蜂蜜蛋糕/單入蛋糕僅可追加原訂單已有口味`)
          return
        }
        if (product.category === 'tube' && hasExistingTube && !isExistingItem) {
          alert(`「${product.name}」無法追加：原訂單已有旋轉筒，只可追加原口味`)
          return
        }
      }
    }

    setSaving(true)
    try {
      await onConfirm({ splits: cleanedSplits, appends: cleanedAppends })
      onOpenChange(false)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`分批/追加失敗：${msg}`)
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

        <div className="space-y-5">
          {/* === 分批 section === */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-blue-700 border-b border-blue-200 pb-1">
              分批 — 將原訂單品項拆分到其他日期
            </div>
            <p className="text-xs text-gray-500">
              每個分批日期會建立一筆獨立訂單(複製客戶/付款/包裝等),原訂單品項數量自動扣減。
            </p>

            {poolEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-center text-xs text-gray-400">
                原訂單沒有可分配的品項
              </div>
            ) : (
              <>
                <div className="rounded-lg border bg-blue-50/40 p-3 space-y-1">
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

          {/* === 追加 section === */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-amber-700 border-b border-amber-200 pb-1">
              追加 — 在新日期增加訂單
            </div>
            <p className="text-xs text-gray-500">
              建立新日期訂單(不從原訂單扣減)：原訂單已有品項可追加數量(沿用包裝/烙印)；
              旋轉筒可追加新口味(每筆只能選一種 + 包裝)；曲奇可任意多選。
            </p>

            <div className="space-y-3">
              {appends.map((row, idx) => {
                const tubeFilledIds = allTubes
                  .filter((p) => (row.items[p.id] || 0) > 0)
                  .map((p) => p.id)
                const tubeAnyFilled = tubeFilledIds.length > 0
                const showCookies = hasExistingCookie ? existingCookies : allCookies
                const noCategoryAvailable =
                  !hasExistingCake && !hasExistingSingleCake
                  && existingTubes.length === 0 && allTubes.length === 0
                  && showCookies.length === 0

                return (
                  <div key={row.rowId} className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        追加 {idx + 1}
                      </span>
                      <div className="flex-1">
                        <Input
                          type="date"
                          value={row.date}
                          onChange={(e) => updateAppendRow(row.rowId, { date: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => removeAppendRow(row.rowId)}
                        className="shrink-0"
                      >
                        <XIcon className="size-3" />
                      </Button>
                    </div>

                    {/* 蜂蜜蛋糕：僅原訂單已有口味才開放 */}
                    {hasExistingCake && (
                      <div className="rounded-md bg-amber-50/40 p-2 space-y-1.5">
                        <div className="text-xs font-semibold text-gray-700">
                          蜂蜜蛋糕（沿用原訂單包裝/烙印）
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {existingCakes.map((p) => (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 flex-1 truncate">{p.name}</span>
                              <Input
                                type="number"
                                min={0}
                                value={row.items[p.id] || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateAppendItem(row.rowId, p.id, parseInt(e.target.value) || 0)
                                }
                                className="h-7 w-16 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 旋轉筒：原訂單已有 → 限原口味；沒有 → 新口味單選 + 包裝 */}
                    {hasExistingTube ? (
                      <div className="rounded-md bg-amber-50/40 p-2 space-y-1.5">
                        <div className="text-xs font-semibold text-gray-700">
                          旋轉筒（沿用原訂單包裝，限原口味）
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {existingTubes.map((p) => (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 flex-1 truncate">{p.name}</span>
                              <Input
                                type="number"
                                min={0}
                                value={row.items[p.id] || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateAppendItem(row.rowId, p.id, parseInt(e.target.value) || 0)
                                }
                                className="h-7 w-16 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : allTubes.length > 0 && (
                      <div className="rounded-md bg-amber-50/40 p-2 space-y-1.5">
                        <div className="text-xs font-semibold text-gray-700">
                          旋轉筒（選一種口味，其他反灰）
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {allTubes.map((p) => {
                            const isThisFilled = tubeFilledIds.includes(p.id)
                            const shouldDisable = tubeAnyFilled && !isThisFilled
                            return (
                              <div key={p.id} className="flex items-center gap-2">
                                <span className={`text-xs flex-1 truncate ${shouldDisable ? 'text-gray-300' : 'text-gray-600'}`}>{p.name}</span>
                                <Input
                                  type="number"
                                  min={0}
                                  value={row.items[p.id] || ''}
                                  placeholder="0"
                                  disabled={shouldDisable}
                                  onChange={(e) =>
                                    updateAppendItem(row.rowId, p.id, parseInt(e.target.value) || 0)
                                  }
                                  className="h-7 w-16 text-sm"
                                />
                              </div>
                            )
                          })}
                        </div>
                        {tubeAnyFilled && (
                          <div className="pt-1">
                            <Select
                              value={row.newTubePackagingId || undefined}
                              onValueChange={(v) => v && updateAppendRow(row.rowId, { newTubePackagingId: v })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="選擇包裝">
                                  {row.newTubePackagingId ? tubePkgName(row.newTubePackagingId) : undefined}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {tubePackagingStyles.map((ps) => (
                                  <SelectItem key={ps.id} value={ps.id}>{ps.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 單入蛋糕：僅原訂單已有口味才開放 */}
                    {hasExistingSingleCake && (
                      <div className="rounded-md bg-amber-50/40 p-2 space-y-1.5">
                        <div className="text-xs font-semibold text-gray-700">
                          單入蛋糕（沿用原訂單包裝/烙印）
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {existingSingleCakes.map((p) => (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 flex-1 truncate">{p.name}</span>
                              <Input
                                type="number"
                                min={0}
                                value={row.items[p.id] || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateAppendItem(row.rowId, p.id, parseInt(e.target.value) || 0)
                                }
                                className="h-7 w-16 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 曲奇：原訂單已有 → 限原組合；沒有 → 任意多選 */}
                    {showCookies.length > 0 && (
                      <div className="rounded-md bg-amber-50/40 p-2 space-y-1.5">
                        <div className="text-xs font-semibold text-gray-700">
                          曲奇{hasExistingCookie ? '（限原訂單品項）' : '（任意多選）'}
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {showCookies.map((p) => (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 flex-1 truncate">{p.name}</span>
                              <Input
                                type="number"
                                min={0}
                                value={row.items[p.id] || ''}
                                placeholder="0"
                                onChange={(e) =>
                                  updateAppendItem(row.rowId, p.id, parseInt(e.target.value) || 0)
                                }
                                className="h-7 w-16 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {noCategoryAvailable && (
                      <div className="rounded-md border border-dashed p-2 text-center text-xs text-gray-400">
                        無可追加品項
                      </div>
                    )}
                  </div>
                )
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addAppendRow}
                className="w-full border-amber-200 hover:bg-amber-50"
              >
                <PlusIcon className="mr-1 size-3" /> 新增追加日期
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? '處理中...' : '確認分批/追加'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
