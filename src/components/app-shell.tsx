'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Calendar, BarChart3, Package, Settings, ScrollText,
  Menu, LogOut, User as UserIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useCurrentUserClient, signOut, getSessionExpiresAt, type AuthUser } from '@/lib/auth'
import { logActivity } from '@/lib/activity'

interface NavItem {
  href: string
  label: string
  icon: typeof Calendar
  adminOnly?: boolean
}

const navItems: NavItem[] = [
  { href: '/calendar', label: '月曆', icon: Calendar },
  { href: '/dashboard', label: '統計', icon: BarChart3 },
  { href: '/inventory', label: '庫存', icon: Package },
  { href: '/activity', label: '紀錄', icon: ScrollText },
  { href: '/settings', label: '設定', icon: Settings, adminOnly: true },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, mounted } = useCurrentUserClient()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isLoginPage = pathname === '/login'
  const isPublicPage = isLoginPage || pathname === '/cat'

  // 全域 guard：未登入強制跳轉 /login（除了公開頁面）
  useEffect(() => {
    if (mounted && !user && !isPublicPage) {
      router.replace('/login')
    }
  }, [mounted, user, isPublicPage, router])

  // Session 10 小時固定到期：在到期時間自動登出 + 跳 login
  // 不會因為頁面切換而 reset（AppShell 是 layout 級別，不會 unmount）
  useEffect(() => {
    if (!mounted || !user) return
    const expiresAt = getSessionExpiresAt()
    if (!expiresAt) return
    const remaining = expiresAt - Date.now()
    if (remaining <= 0) {
      logActivity('自動登出', `user:${user.id}`, {
        帳號: user.username,
        原因: 'Session 10 小時到期',
      })
      signOut()
      router.replace('/login')
      return
    }
    const timer = setTimeout(() => {
      logActivity('自動登出', `user:${user.id}`, {
        帳號: user.username,
        原因: 'Session 10 小時到期',
      })
      signOut()
      router.replace('/login')
    }, remaining)
    return () => clearTimeout(timer)
  }, [mounted, user, router])

  // 公開頁面（/login、/cat）不顯示側邊欄
  if (isPublicPage) {
    return <main className="min-h-screen bg-background p-4 md:p-6">{children}</main>
  }

  // 還沒讀完 localStorage、或讀完發現未登入時，顯示空白避免閃過內容
  if (!mounted || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">驗證中...</p>
      </main>
    )
  }

  const visibleNav = navItems.filter((item) => !item.adminOnly || user.is_admin)

  const handleSignOut = async () => {
    await logActivity('登出', `user:${user.id}`, { 帳號: user.username })
    signOut()
    router.replace('/login')
  }

  const NavLinks = ({ currentUser }: { currentUser: AuthUser }) => (
    <nav className="flex h-full flex-col p-3">
      <div className="mb-6 pt-3">
        <div className="mb-4 flex justify-center px-2">
          <Image
            src="/lad-logo.png"
            alt="Like a Dream カステラ"
            width={1500}
            height={832}
            priority
            unoptimized
            className="h-auto w-full max-w-[170px]"
          />
        </div>
        <div className="px-3">
          <h1 className="text-base font-bold text-foreground">📦 包裝行事曆</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">排程管理系統</p>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {visibleNav.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </div>

      <div className="mt-auto border-t border-sidebar-border pt-3">
        <div className="space-y-2 px-1">
          <div className="flex items-center gap-2 rounded-lg bg-accent/40 px-3 py-2">
            <UserIcon className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {currentUser.username}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {currentUser.is_admin ? '管理員' : '一般使用者'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start gap-2"
          >
            <LogOut className="h-4 w-4" />
            登出
          </Button>
        </div>
      </div>
    </nav>
  )

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 border-r border-sidebar-border bg-sidebar md:block">
        <NavLinks currentUser={user} />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 md:hidden">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <span className="text-sm font-medium text-foreground">
                📦 包裝行事曆
              </span>
            </div>
            <span className="text-xs text-muted-foreground">{user.username}</span>
          </header>

          {/* Main content */}
          <main className="flex-1 overflow-auto p-4 md:p-6">
            {children}
          </main>
        </div>

        <SheetContent side="left" className="w-56 p-0">
          <NavLinks currentUser={user} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
