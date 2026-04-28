'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format, parseISO } from 'date-fns'
import { zhTW } from 'date-fns/locale'

interface ActivityRow {
  id: string
  username: string | null
  action: string
  target: string | null
  metadata: Record<string, unknown> | null
  created_at: string
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
      // 順手清理過期紀錄（>30 天），不影響主流程
      try {
        await supabase.rpc('cleanup_old_activity_logs')
      } catch {
        /* 失敗就忽略，不阻塞 fetch */
      }

      const { data } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

      if (!cancelled && data) {
        setLogs(data as ActivityRow[])
      }
      if (!cancelled) setLoading(false)
    }

    fetchLogs()
    return () => {
      cancelled = true
    }
  }, [supabase])

  const filtered = filter.trim()
    ? logs.filter(
        (l) =>
          (l.username ?? '').toLowerCase().includes(filter.toLowerCase()) ||
          l.action.toLowerCase().includes(filter.toLowerCase()) ||
          (l.target ?? '').toLowerCase().includes(filter.toLowerCase()),
      )
    : logs

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-foreground">📜 操作紀錄</h1>

      <div className="mb-4 flex items-center gap-3">
        <input
          type="search"
          placeholder="篩選帳號 / 動作..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-9 w-64 rounded-md border border-input bg-card px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        <span className="text-xs text-muted-foreground">
          顯示最近 {logs.length} 筆 · 過 30 天自動刪除
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
            <ul className="divide-y divide-border">
              {filtered.map((l) => (
                <li key={l.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs">
                          {l.username ?? '訪客'}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">
                          {l.action}
                        </span>
                      </div>
                      {l.target && (
                        <p className="text-xs text-muted-foreground truncate">
                          目標：{l.target}
                        </p>
                      )}
                      {l.metadata && Object.keys(l.metadata).length > 0 && (
                        <p className="text-xs text-muted-foreground truncate">
                          {Object.entries(l.metadata)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format(parseISO(l.created_at), 'M/d HH:mm:ss', { locale: zhTW })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
