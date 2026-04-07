'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Settings } from 'lucide-react'

export default function MaterialsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">🧱 包材庫存</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Settings className="mr-1 h-4 w-4" /> 設定用量對照
          </Button>
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" /> 入庫
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 text-5xl">🧱</div>
          <h2 className="mb-2 text-lg font-semibold text-gray-700">包材品項待設定</h2>
          <p className="mb-4 max-w-md text-sm text-gray-500">
            請提供包材品項清單（名稱、單位、安全庫存量）及每種產品消耗多少包材的對照表，
            系統將自動根據訂單計算包材消耗量。
          </p>
          <Badge variant="outline" className="text-sm">
            框架已就緒，待補充品項資料
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">系統將支援的功能</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span> 包材品項管理（名稱、單位、安全庫存）
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span> 包材庫存即時顯示
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span> 入庫/出庫紀錄
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span> 產品→包材用量對照表
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span> 根據訂單自動計算包材消耗
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span> 低庫存警示
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
