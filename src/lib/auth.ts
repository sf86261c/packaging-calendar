'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase'

export interface AuthUser {
  id: string
  username: string
  is_admin: boolean
}

const STORAGE_KEY = 'packaging-calendar:auth'

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

function readUser(): AuthUser | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === cachedRaw) return cachedUser
  cachedRaw = raw
  if (!raw) {
    cachedUser = null
    return cachedUser
  }
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.username === 'string' &&
      typeof parsed.is_admin === 'boolean'
    ) {
      cachedUser = parsed as AuthUser
    } else {
      cachedUser = null
    }
  } catch {
    cachedUser = null
  }
  return cachedUser
}

function writeUser(user: AuthUser | null) {
  if (typeof window === 'undefined') return
  if (user) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  } else {
    window.localStorage.removeItem(STORAGE_KEY)
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

export async function signIn(username: string, password: string): Promise<AuthUser> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('sign_in', {
    p_username: username,
    p_password: password,
  })
  if (error) throw new Error(`登入失敗：${error.message}`)
  if (!data || data.length === 0) {
    throw new Error('帳號或密碼錯誤')
  }
  const user = data[0] as AuthUser
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
  const user = data[0] as AuthUser
  writeUser(user)
  return user
}

export function signOut() {
  writeUser(null)
}

export function getCurrentUserSync(): AuthUser | null {
  return readUser()
}
