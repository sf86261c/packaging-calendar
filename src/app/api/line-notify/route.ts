import { NextResponse } from 'next/server'

interface LowStockProduct {
  name: string
  stock: number
  safetyStock: number
}

export async function POST(request: Request) {
  try {
    const { products } = (await request.json()) as { products: LowStockProduct[] }

    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
    const targetId = process.env.LINE_TARGET_ID

    if (!token || !targetId) {
      return NextResponse.json(
        { error: 'LINE 設定未完成，請在 .env.local 設定 LINE_CHANNEL_ACCESS_TOKEN 和 LINE_TARGET_ID' },
        { status: 500 },
      )
    }

    if (!products || products.length === 0) {
      return NextResponse.json({ error: '沒有庫存不足的產品' }, { status: 400 })
    }

    const lines = products.map(
      (p) => `• ${p.name}：目前 ${p.stock.toLocaleString()}，安全庫存 ${p.safetyStock.toLocaleString()}`,
    )
    const message = [
      '⚠️ 庫存不足通知',
      '',
      '以下產品庫存不足，請及時叫貨：',
      '',
      ...lines,
      '',
      `📅 ${new Date().toLocaleDateString('zh-TW')}`,
      '— 包裝行事曆系統',
    ].join('\n')

    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: targetId,
        messages: [{ type: 'text', text: message }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json(
        { error: `LINE API 錯誤: ${errText}` },
        { status: res.status },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
