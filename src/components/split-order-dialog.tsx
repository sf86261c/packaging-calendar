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
  // 各類別 effective 包裝/烙印：原訂單已有則沿用 originalXxx；沒有則用追加 dialog 中選的；無該類別品項時為 null
  cakePackagingId?: string | null
  cakeBrandingId?: string | null
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
  // 使用者在 dialog 中選的新規格（僅原訂單沒有該類別時用）
  newCakePackagingId: string
  newCakeBrandingId: string
  newTubePackagingId: string
}

interface PackagingStyleLite {
  id: string
  name: string
}

interface BrandingStyleLite {
  id: string
  name: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  originalDate: string
  poolItems: Record<string, number>
  // 該客戶可追加的品項清單（原訂單 + 兄弟批次品項，僅 single_cake 用此限制原口味）
  appendableProductIds: string[]
  // 各類別包裝/烙印選項（原訂單沒有該類別時讓使用者選）
  cakePackagingStyles: PackagingStyleLite[]
  cakeBrandingStyles: BrandingStyleLite[]
  tubePackagingStyles: PackagingStyleLite[]
  // 原訂單已有的包裝/烙印（已有時沿用）
  originalCakePackagingId?: string | null
  originalCakeBrandingId?: string | null
  originalTubePackagingId?: string | null
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
  newCakePackagingId: '',
  newCakeBrandingId: '',
  newTubePackagingId: '',
})

export function SplitOrderDialog({
  open, onOpenChange, originalDate, poolItems, appendableProductIds,
  cakePackagingStyles, cakeBrandingStyles, tubePackagingStyles,
  originalCakePackagingId, originalCakeBrandingId, originalTubePackagingId,
  products, onConfirm,
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

  const allCakes = useMemo(
    () => products
      .filter((p) => p.category === 'cake' && p.is_active)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [products],
  )
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
    () => allCakes.filter((p) => appendableSet.has(p.id)),
    [allCakes, appendableSet],
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

  // 「原訂單群已有某類別」= 該類別至少有一個 product 在 appendableSet 中
  const hasExistingCake = existingCakes.length > 0
  const hasExistingTube = existingTubes.length > 0
  const hasExistingSingleCake = existingSingleCakes.length > 0

  const cakePkgName = (id: string) => cakePackagingStyles.find((p) => p.id === id)?.name ?? ''
  const cakeBrandName = (id: string) => cakeBrandingStyles.find((b) => b.id === id)?.name ?? ''
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
  const updateAppendRow = (
    rowId: string,
    patch: Partial<Pick<AppendRow, 'date' | 'newCakePackagingId' | 'newCakeBrandingId' | 'newTubePackagingId'>>,
  ) =>
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
        const hasCakeItem = allCakes.some((p) => (items[p.id] || 0) > 0)
        const hasTubeItem = allTubes.some((p) => (items[p.id] || 0) > 0)
        const cakePackagingId = hasCakeItem
          ? (hasExistingCake ? (originalCakePackagingId || null) : (a.newCakePackagingId || null))
          : null
        const cakeBrandingId = hasCakeItem
          ? (hasExistingCake ? (originalCakeBrandingId || null) : (a.newCakeBrandingId || null))
          : null
        const tubePackagingId = hasTubeItem
          ? (hasExistingTube ? (originalTubePackagingId || null) : (a.newTubePackagingId || null))
          : null
        return { date: a.date, items, cakePackagingId, cakeBrandingId, tubePackagingId }
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
      const hasCakeItem = allCakes.some((p) => (a.items[p.id] || 0) > 0)
      const hasTubeItem = allTubes.some((p) => (a.items[p.id] || 0) > 0)

      // 原訂單沒有蜂蜜蛋糕但該 row 有蜂蜜蛋糕 → 必須選包裝 + 烙印
      if (hasCakeItem && !hasExistingCake) {
        if (!a.cakePackagingId) {
          alert('追加新蜂蜜蛋糕時必須選擇包裝款式')
          return
        }
        if (!a.cakeBrandingId) {
          alert('追加新蜂蜜蛋糕時必須選擇烙印款式')
          return
        }
      }
      // 原訂單沒有旋轉筒但該 row 有旋轉筒 → 必須選包裝
      if (hasTubeItem && !hasExistingTube) {
        if (!a.tubePackagingId) {
          alert('追加新旋轉筒時必須選擇包裝款式')
          return
        }
      }
      // 已有的類別只能追加原口味（雙保險，UI 上已限制）
      for (const pid of Object.keys(a.items)) {
        if ((a.items[pid] || 0) <= 0) continue
        const product = products.find((p) => p.id === pid)
        if (!product) continue
        const isExistingItem = appendableSet.has(pid)
        if (product.category === 'cake' && hasExistingCake && !isExistingItem) {
          alert(`「${product.name}」無法追加：原訂單已有蜂蜜蛋糕，僅可追加原口味的數量`)
          return
        }
        if (product.category === 'tube' && hasExistingTube && !isExistingItem) {
          alert(`「${product.name}」無法追加：原訂單已有旋轉筒，僅可追加原口味的數量`)
          return
        }
        if (product.category === 'single_cake' && !isExistingItem) {
          alert(`「${product.name}」無法追加：單入蛋糕僅可追加原訂單已有口味`)
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
                              <span className="text-xs text-gray-600 flex-1 break-words">{p.name}</span>
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
              建立新日期訂單(不從原訂單扣減)。每張訂單只能一種蜂蜜蛋糕、一種旋轉筒（口味可多種，共用包裝/烙印），曲奇可任意多選。
              {hasExistingCake || hasExistingTube
                ? ' 已有的類別自動沿用原訂單包裝/烙印。'
                : ''}
            </p>

            <div className="space-y-3">
              {appends.map((row, idx) => {
                // 「沒有」類別 + 已選某口味 → 其他口味隱藏（每筆追加只能一種口味）
                const cakeSelectedId = !hasExistingCake
                  ? allCakes.find((p) => (row.items[p.id] || 0) > 0)?.id
                  : undefined
                const tubeSelectedId = !hasExistingTube
                  ? allTubes.find((p) => (row.items[p.id] || 0) > 0)?.id
                  : undefined
                const cakeListToShow = hasExistingCake
                  ? existingCakes
                  : (cakeSelectedId ? allCakes.filter((p) => p.id === cakeSelectedId) : allCakes)
                const tubeListToShow = hasExistingTube
                  ? existingTubes
                  : (tubeSelectedId ? allTubes.filter((p) => p.id === tubeSelectedId) : allTubes)
                const noCategoryAvailable =
                  allCakes.length === 0 && allTubes.length === 0
                  && !hasExistingSingleCake && allCookies.length === 0

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

                    {/* 蜂蜜蛋糕：已有→限原口味，沿用包裝/烙印；沒有→顯示全部口味 + 包裝/烙印下拉 */}
                    {((hasExistingCake && existingCakes.length > 0) || (!hasExistingCake && allCakes.length > 0)) && (
                      <div className="rounded-md bg-amber-50/40 p-2 space-y-1.5">
                        <div className="text-xs font-semibold text-gray-700">
                          蜂蜜蛋糕{hasExistingCake ? '（限原口味，沿用原訂單包裝/烙印）' : '（請選擇新包裝/烙印）'}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {cakeListToShow.map((p) => (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 flex-1 break-words">{p.name}</span>
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
                        {!hasExistingCake && allCakes.some((p) => (row.items[p.id] || 0) > 0) && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <Select
                              value={row.newCakeBrandingId || undefined}
                              onValueChange={(v) => v && updateAppendRow(row.rowId, { newCakeBrandingId: v })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="烙印款式">
                                  {row.newCakeBrandingId ? cakeBrandName(row.newCakeBrandingId) : undefined}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {cakeBrandingStyles.map((b) => (
                                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={row.newCakePackagingId || undefined}
                              onValueChange={(v) => v && updateAppendRow(row.rowId, { newCakePackagingId: v })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="包裝款式">
                                  {row.newCakePackagingId ? cakePkgName(row.newCakePackagingId) : undefined}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {cakePackagingStyles.map((ps) => (
                                  <SelectItem key={ps.id} value={ps.id}>{ps.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 旋轉筒：已有→限原口味，沿用包裝；沒有→顯示全部口味 + 包裝下拉 */}
                    {((hasExistingTube && existingTubes.length > 0) || (!hasExistingTube && allTubes.length > 0)) && (
                      <div className="rounded-md bg-amber-50/40 p-2 space-y-1.5">
                        <div className="text-xs font-semibold text-gray-700">
                          旋轉筒{hasExistingTube ? '（限原口味，沿用原訂單包裝）' : '（請選擇新包裝）'}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {tubeListToShow.map((p) => (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 flex-1 break-words">{p.name}</span>
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
                        {!hasExistingTube && allTubes.some((p) => (row.items[p.id] || 0) > 0) && (
                          <div className="pt-1">
                            <Select
                              value={row.newTubePackagingId || undefined}
                              onValueChange={(v) => v && updateAppendRow(row.rowId, { newTubePackagingId: v })}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="包裝款式">
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

                    {/* 單入蛋糕：保守處理 — 僅原訂單已有口味才開放 */}
                    {hasExistingSingleCake && (
                      <div className="rounded-md bg-amber-50/40 p-2 space-y-1.5">
                        <div className="text-xs font-semibold text-gray-700">
                          單入蛋糕（沿用原訂單包裝/烙印，限原口味）
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {existingSingleCakes.map((p) => (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 flex-1 break-words">{p.name}</span>
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

                    {/* 曲奇：永遠顯示全部，任意多選 */}
                    {allCookies.length > 0 && (
                      <div className="rounded-md bg-amber-50/40 p-2 space-y-1.5">
                        <div className="text-xs font-semibold text-gray-700">
                          曲奇（任意多選）
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {allCookies.map((p) => (
                            <div key={p.id} className="flex items-center gap-2">
                              <span className="text-xs text-gray-600 flex-1 break-words">{p.name}</span>
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
