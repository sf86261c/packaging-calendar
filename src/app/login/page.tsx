'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, signUp } from '@/lib/auth'
import { logActivity } from '@/lib/activity'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password) {
      setError('請輸入帳號與密碼')
      return
    }
    setLoading(true)
    try {
      if (mode === 'signup') {
        const user = await signUp(username.trim(), password)
        await logActivity('帳號.註冊', `user:${user.id}`, { username: user.username })
      } else {
        const user = await signIn(username.trim(), password)
        await logActivity('帳號.登入', `user:${user.id}`, { username: user.username })
      }
      router.push('/calendar')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            📦 包裝行事曆 — {mode === 'signin' ? '登入' : '註冊'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>帳號</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="輸入帳號"
                autoComplete="username"
                autoFocus
              />
            </div>
            <div>
              <Label>密碼</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? '至少 4 個字元' : '輸入密碼'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '處理中...' : mode === 'signin' ? '登入' : '註冊並登入'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
                setError(null)
              }}
              className="block w-full text-center text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {mode === 'signin' ? '還沒有帳號？立即註冊' : '已有帳號？返回登入'}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
