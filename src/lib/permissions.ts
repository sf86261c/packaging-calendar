export type PageRoute = 'calendar' | 'dashboard' | 'inventory' | 'activity' | 'settings'
export type PageMode = 'none' | 'view' | 'edit' | 'adjustment_only'

export type UserPermissions = Partial<Record<PageRoute, PageMode>>

export interface PermissionSubject {
  is_admin: boolean
  permissions?: UserPermissions
}

const DEFAULT_NON_ADMIN_MODE: PageMode = 'none'

export function getPageMode(user: PermissionSubject | null, page: PageRoute): PageMode {
  if (!user) return 'none'
  if (user.is_admin) return 'edit'
  return user.permissions?.[page] ?? DEFAULT_NON_ADMIN_MODE
}

export function canAccessPage(user: PermissionSubject | null, page: PageRoute): boolean {
  return getPageMode(user, page) !== 'none'
}

export function canEditPage(user: PermissionSubject | null, page: PageRoute): boolean {
  return getPageMode(user, page) === 'edit'
}

export function canViewPage(user: PermissionSubject | null, page: PageRoute): boolean {
  const m = getPageMode(user, page)
  return m === 'view' || m === 'edit'
}

// 月曆頁的「試吃/耗損/散單」按鈕：edit 與 adjustment_only 兩種模式都可用
export function canUseStockAdjustment(user: PermissionSubject | null): boolean {
  const m = getPageMode(user, 'calendar')
  return m === 'edit' || m === 'adjustment_only'
}

// 月曆頁的訂單操作（CRUD、進入日頁面）：只有 edit 才行
export function canUseCalendarOrders(user: PermissionSubject | null): boolean {
  return getPageMode(user, 'calendar') === 'edit'
}

// 庫存頁：入庫與數量修正（inventory=edit 即可，不必是管理員）
export function canEditStock(user: PermissionSubject | null): boolean {
  return getPageMode(user, 'inventory') === 'edit'
}

// 庫存頁：包材/分類主檔、水源轉移、排序、叫貨通知等破壞性動作（僅管理員）
export function canAdminInventory(user: PermissionSubject | null): boolean {
  return !!user?.is_admin
}

// 紀錄頁：activity=edit 看全部，view 只看自己
export function canViewAllActivity(user: PermissionSubject | null): boolean {
  return getPageMode(user, 'activity') === 'edit'
}
