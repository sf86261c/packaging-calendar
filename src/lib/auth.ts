'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase'

export type PageRoute = 'calendar' | 'dashboard' | 'inventory' | 'activity' | 'settings'
export type PageMode = 'none' | 'view' | 'edit' | 'adjustment_only'

export type UserPermissions = Partial<Record<PageRoute, PageMode>>

export interface AuthUser {
  id: string
  username: string
  is_admin: boolean
  permissions: UserPermissions
}

const STORAGE_KEY = 'packaging-calendar:auth'
const SESSION_TTL_MS = 10 * 60 * 60 * 1000  // 10 小時固定時長

interface StoredSession {
  id: string
  username: string
  is_admin: boolean
  permissions: UserPermissions
  expiresAt: number
}

// ─── Permission helpers ────────────────────────────────────────────
// is_admin → 永遠所有頁面 edit、永遠可用試吃/耗損/散單
// 否則查 permissions[page]：
//   - 'none' / 缺值（預設）→ 看不到
//   - 'view' → 可看，不可改
//   - 'edit' → 完整
//   - 'adjustment_only' → calendar 限定，僅顯示「試吃/耗損/散單」按鈕

const DEFAULT_NON_ADMIN_MODE: PageMode = 'none'

export function getPageMode(user: AuthUser | null, page: PageRoute): PageMode {
  if (!user) return 'none'
  if (user.is_admin) return 'edit'
  return user.permissions?.[page] ?? DEFAULT_NON_ADMIN_MODE
}

export function canAccessPage(user: AuthUser | null, page: PageRoute): boolean {
  return getPageMode(user, page) !== 'none'
}

export function canEditPage(user: AuthUser | null, page: PageRoute): boolean {
  return getPageMode(user, page) === 'edit'
}

export function canViewPage(user: AuthUser | null, page: PageRoute): boolean {
  const m = getPageMode(user, page)
  return m === 'view' || m === 'edit'
}

// 月曆頁的「試吃/耗損/散單」按鈕：edit 與 adjustment_only 兩種模式都可用
export function canUseStockAdjustment(user: AuthUser | null): boolean {
  const m = getPageMode(user, 'calendar')
  return m === 'edit' || m === 'adjustment_only'
}

// 月曆頁的訂單操作（CRUD、進入日頁面）：只有 edit 才行
export function canUseCalendarOrders(user: AuthUser | null): boolean {
  return getPageMode(user, 'calendar') === 'edit'
}

// ─── Pub/sub for cross-component reactive updates ───
type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  for (const l of listeners) l()
}

// useSyncExternalStore 要求 getSnapshot 在資料未變時回傳「同一物件 reference」，
// 否則會被 React 視為持續變動而觸發無限 re-render（minified error #185）。
// 因此在 module level cache 解析結果，只有 raw string 變化時才重新 parse。
let cachedRaw: string | null = null
let cachedUser: AuthUser | null = null
let cachedExpiresAt: number | null = null

function clearSession() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY)
  }
  cachedRaw = null
  cachedUser = null
  cachedExpiresAt = null
}

function readUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === cachedRaw) {
    // 同一筆 cache，但仍要檢查是否過期（時間流逝）
    if (cachedExpiresAt !== null && Date.now() >= cachedExpiresAt) {
      clearSession()
      return null
    }
    return cachedUser
  }
  cachedRaw = raw
  if (!raw) {
    cachedUser = null
    cachedExpiresAt = null
    return cachedUser
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    if (
      parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.username === 'string' &&
      typeof parsed.is_admin === 'boolean' &&
      typeof parsed.expiresAt === 'number'
    ) {
      if (Date.now() >= parsed.expiresAt) {
        // 過期：清除 storage 並回傳 null
        clearSession()
        return null
      }
      cachedExpiresAt = parsed.expiresAt
      cachedUser = {
        id: parsed.id,
        username: parsed.username,
        is_admin: parsed.is_admin,
        permissions: (parsed.permissions ?? {}) as UserPermissions,
      }
    } else {
      cachedUser = null
      cachedExpiresAt = null
    }
  } catch {
    cachedUser = null
    cachedExpiresAt = null
  }
  return cachedUser
}

export function getSessionExpiresAt(): number | null {
  if (typeof window === 'undefined') return null
  // 觸發 readUser 來更新 cache（保持與 cachedExpiresAt 同步）
  readUser()
  return cachedExpiresAt
}

function writeUser(user: AuthUser | null) {
  if (typeof window === 'undefined') return
  if (user) {
    const session: StoredSession = {
      ...user,
      expiresAt: Date.now() + SESSION_TTL_MS,
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    // 寫入後立即更新 cache（避免下次 read 命中舊 cache）
    cachedRaw = window.localStorage.getItem(STORAGE_KEY)
    cachedUser = user
    cachedExpiresAt = session.expiresAt
  } else {
    clearSession()
  }
  notify()
}

// ─── Hooks ───

export function useCurrentUser(): AuthUser | null {
  // useSyncExternalStore 確保多分頁/多元件即時同步
  const subscribe = (cb: Listener) => {
    listeners.add(cb)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) cb()
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', onStorage)
    }
    return () => {
      listeners.delete(cb)
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', onStorage)
      }
    }
  }
  const get = () => readUser()
  const getServer = () => null
  return useSyncExternalStore(subscribe, get, getServer)
}

// 給「mount 後才讀」的場景（避免 hydration mismatch）
export function useCurrentUserClient(): { user: AuthUser | null; mounted: boolean } {
  const [mounted, setMounted] = useState(false)
  const user = useCurrentUser()
  useEffect(() => setMounted(true), [])
  return { user, mounted }
}

// ─── Operations ───

function normalizeAuthUser(raw: Record<string, unknown>): AuthUser {
  return {
    id: raw.id as string,
    username: raw.username as string,
    is_admin: !!raw.is_admin,
    permissions: ((raw.permissions ?? {}) as UserPermissions),
  }
}

export async function signIn(username: string, password: string): Promise<AuthUser> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('sign_in', {
    p_username: username,
    p_password: password,
  })
  if (error) throw new Error(`登入失敗：${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('帳號或密碼錯誤、或帳號已停用')
  }
  const user = normalizeAuthUser(data[0])
  writeUser(user)
  return user
}

export async function signUp(username: string, password: string): Promise<AuthUser> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('sign_up', {
    p_username: username,
    p_password: password,
  })
  if (error) throw new Error(`註冊失敗：${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('註冊失敗：未取得帳號資訊')
  }
  const user = normalizeAuthUser(data[0])
  writeUser(user)
  return user
}

export function signOut() {
  writeUser(null)
}

export function getCurrentUserSync(): AuthUser | null {
  return readUser()
}
