'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUserClient } from '@/lib/auth'

/**
 * 不存在的路由 → 依登入狀態決定要導向哪裡：
 *   已登入  → /calendar（首頁）
 *   未登入  → /login
 *
 * 這樣使用者輸入任何錯誤 URL 都不會看到 Next.js 預設的 404 錯誤頁，
 * 而是優雅跳轉。
 */
export default function NotFound() {
  const router = useRouter()
  const { user, mounted } = useCurrentUserClient()

  useEffect(() => {
    if (!mounted) return
    router.replace(user ? '/calendar' : '/login')
  }, [mounted, user, router])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">頁面不存在，正在重新導向...</p>
    </div>
  )
}
