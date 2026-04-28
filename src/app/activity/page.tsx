'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format, parseISO } from 'date-fns'

interface ActivityRow {
  id: string
  username: string | null
  action: string
  target: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// 從 metadata 取出客戶名稱（兼容舊資料的 customer 鍵）
function pickCustomer(meta: Record<string, unknown> | null): string {
  if (!meta) return ''
  const candidates = ['客戶', 'customer', '客戶名稱', '帳號']
  for (const k of candidates) {
    const v = meta[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return ''
}

// 把 metadata 轉成顯示字串（中文 key 優先；過濾空值）
function formatDetail(meta: Record<string, unknown> | null, exclude: string[]): string {
  if (!meta) return ''
  return Object.entries(meta)
    .filter(([k, v]) => !exclude.includes(k) && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}：${String(v)}`)
    .join('｜')
}

export default function ActivityPage() {
  const supabase = createClient()
  const [logs, setLogs] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false

    const fetchLogs = async () => {
      setLoading(true)
      // 順手清理過期紀錄（>30 天）
      try {
        await supabase.rpc('cleanup_old_activity_logs')
      } catch {
        /* 失敗就忽略 */
      }

      const { data } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

      if (!cancelled && data) setLogs(data as ActivityRow[])
      if (!cancelled) setLoading(false)
    }

    fetchLogs()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const filtered = filter.trim()
    ? logs.filter((l) => {
        const q = filter.toLowerCase()
        return (
          (l.username ?? '').toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q) ||
          pickCustomer(l.metadata).toLowerCase().includes(q)
        )
      })
    : logs

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-6 text-2xl font-bold text-foreground">📜 操作紀錄</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="篩選帳號 / 改動項目 / 客戶..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 w-72 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        <span className="text-xs text-muted-foreground">
          顯示最近 {logs.length} 筆 · 超過 30 天自動刪除
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">紀錄列表（{filtered.length} 筆）</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">載入中...</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {filter ? `找不到「${filter}」相關紀錄` : '尚無紀錄'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">日期</th>
                    <th className="px-3 py-2 text-left font-medium">時間</th>
                    <th className="px-3 py-2 text-left font-medium">操作者</th>
                    <th className="px-3 py-2 text-left font-medium">客戶</th>
                    <th className="px-3 py-2 text-left font-medium">改動項目</th>
                    <th className="px-3 py-2 text-left font-medium">詳情</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((l) => {
                    const dt = parseISO(l.created_at)
                    const customer = pickCustomer(l.metadata)
                    const detail = formatDetail(l.metadata, ['客戶', 'customer', '客戶名稱', '帳號'])
                    return (
                      <tr key={l.id} className="hover:bg-accent/30">
                        <td className="whitespace-nowrap px-3 py-2 text-foreground">
                          {format(dt, 'yyyy/MM/dd')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {format(dt, 'HH:mm:ss')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <Badge variant="secondary" className="text-xs">
                            {l.username ?? '訪客'}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                          {customer || <span className="text-gray-300">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-foreground">
                          {l.action}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {detail || <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
