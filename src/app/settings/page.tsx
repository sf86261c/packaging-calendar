'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">⚙️ 設定</h1>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">產品管理</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">🍰 蜂蜜蛋糕（組合盒）</p>
              <div className="flex flex-wrap gap-2">
                <Badge>經典原味+伯爵紅茶</Badge>
                <Badge>經典原味+茉莉花茶</Badge>
                <Badge>伯爵紅茶+茉莉花茶</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">🫙 旋轉筒</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">經典原味</Badge>
                <Badge variant="outline">伯爵紅茶</Badge>
                <Badge variant="outline">茉莉花茶</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">📦 單入蛋糕</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">經典原味</Badge>
                <Badge variant="outline">伯爵紅茶</Badge>
                <Badge variant="outline">茉莉花茶</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">🍪 曲奇</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">原味白🍪</Badge>
                <Badge variant="secondary">可可粉🍪</Badge>
                <Badge variant="secondary">伯爵藍🍪</Badge>
                <Badge variant="secondary">綜合白🍪</Badge>
                <Badge variant="secondary">綜合粉🍪</Badge>
                <Badge variant="secondary">綜合藍🍪</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">包裝款式</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">蛋糕盒</p>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-amber-100 text-amber-800">祝福緞帶(米)</Badge>
                <Badge className="bg-pink-100 text-pink-800">森林旋律(粉)</Badge>
                <Badge className="bg-blue-100 text-blue-800">歡樂派對(藍)</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">旋轉筒</p>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-green-100 text-green-800">四季童話</Badge>
                <Badge className="bg-blue-50 text-blue-800">銀河探險</Badge>
                <Badge className="bg-orange-100 text-orange-800">旋轉木馬</Badge>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">單入蛋糕</p>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-pink-50 text-pink-800">愛心</Badge>
                <Badge className="bg-green-50 text-green-800">花園</Badge>
                <Badge className="bg-yellow-50 text-yellow-800">小熊</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">烙印款式</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">甜蜜樂章</Badge>
              <Badge variant="outline">慶祝派對</Badge>
              <Badge variant="outline">馬年限定（僅蛋糕）</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">帳號管理</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">可在 Supabase Dashboard 管理使用者帳號</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
