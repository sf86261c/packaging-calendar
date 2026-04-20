'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Calendar, Search, BarChart3, Package, Boxes, Settings,
  Menu,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'

const navItems = [
  { href: '/calendar', label: '月曆', icon: Calendar },
  { href: '/search', label: '搜尋', icon: Search },
  { href: '/dashboard', label: '統計', icon: BarChart3 },
  { href: '/inventory', label: '庫存', icon: Package },
  { href: '/materials', label: '包材', icon: Boxes },
  { href: '/settings', label: '設定', icon: Settings },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const NavLinks = () => (
    <nav className="flex flex-col gap-1 p-3">
      <div className="mb-4 px-3 py-2">
        <h1 className="text-lg font-bold text-gray-800">📦 包裝行事曆</h1>
        <p className="text-xs text-gray-500">排程管理系統</p>
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
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
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
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 border-r border-gray-200 bg-white md:block">
        <NavLinks />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4 md:hidden">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
                <Menu className="h-5 w-5" />
              </Button>
              <span className="text-sm font-medium text-gray-700">
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
