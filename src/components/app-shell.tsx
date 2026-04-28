'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Calendar, BarChart3, Package, Settings,
  Menu,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'

const navItems = [
  { href: '/calendar', label: '月曆', icon: Calendar },
  { href: '/dashboard', label: '統計', icon: BarChart3 },
  { href: '/inventory', label: '庫存', icon: Package },
  { href: '/settings', label: '設定', icon: Settings },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const NavLinks = () => (
    <nav className="flex flex-col gap-1 p-3">
      <div className="mb-4 px-3 py-2">
        <h1 className="text-lg font-bold text-foreground">📦 包裝行事曆</h1>
        <p className="text-xs text-muted-foreground">排程管理系統</p>
      </div>
      {navItems.map((item) => {
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
    </nav>
  )

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 border-r border-sidebar-border bg-sidebar md:block">
        <NavLinks />
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
          </header>

          {/* Main content */}
          <main className="flex-1 overflow-auto p-4 md:p-6">
            {children}
          </main>
        </div>

        <SheetContent side="left" className="w-56 p-0">
          <NavLinks />
        </SheetContent>
      </Sheet>
    </div>
  )
}
