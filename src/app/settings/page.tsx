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
          <CardContent>
            <p className="text-sm text-gray-500">新增、編輯或停用蛋糕/曲奇/圓筒口味</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge>原味🍰</Badge><Badge>紅茶🍰</Badge><Badge>茉莉🍰</Badge>
              <Badge variant="secondary">原味白🍪</Badge><Badge variant="secondary">可可粉🍪</Badge>
              <Badge variant="secondary">伯爵藍🍪</Badge>
              <Badge variant="secondary">綜合白🍪</Badge><Badge variant="secondary">綜合粉🍪</Badge>
              <Badge variant="secondary">綜合藍🍪</Badge>
              <Badge variant="outline">四季圓筒</Badge><Badge variant="outline">太空圓筒</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">包裝款式</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-amber-100 text-amber-800">祝福緞帶(米)</Badge>
              <Badge className="bg-pink-100 text-pink-800">森林旋律(粉)</Badge>
              <Badge className="bg-blue-100 text-blue-800">歡樂派對(藍)</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">烙印款式</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">A</Badge>
              <Badge variant="outline">B</Badge>
              <Badge variant="outline">C</Badge>
              <Badge variant="outline">新A</Badge>
              <Badge variant="outline">新B</Badge>
              <Badge variant="outline">蛇</Badge>
              <Badge variant="outline">蛇寶</Badge>
              <Badge variant="outline">蛇年烙印</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">帳號管理</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">連接 Supabase 後可管理使用者帳號</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
