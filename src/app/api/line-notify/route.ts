import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
    const lineTargetId = process.env.LINE_TARGET_ID

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY 未設定' }, { status: 500 })
    }
    if (!lineToken || !lineTargetId) {
      return NextResponse.json({ error: 'LINE 設定未完成' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    // ── Product inventory: per-product lead_time_days ──
    // safety_stock 改為 per-product DB 欄位（migration 017）
    // lead_time_days + show_in_inventory（migration 019）
    const { data: products } = await supabase
      .from('products')
      .select('id, name, category, safety_stock, lead_time_days, show_in_inventory')
      .eq('is_active', true)
      .eq('show_in_inventory', true)
      .in('category', ['cake_bar', 'cookie'])

    const lowProducts: { name: string; stock: number; safety: number; leadTime: number }[] = []

    if (products && products.length > 0) {
      const maxLead = Math.max(...products.map(p => (p as { lead_time_days?: number }).lead_time_days ?? 15))
      const maxDate = addDaysISO(maxLead)
      const productIds = products.map(p => p.id)

      // 分頁抓取避免 Supabase 1000 筆 limit 截斷
      type InvRow = { product_id: string; quantity: number; date: string }
      const invData: InvRow[] = []
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data } = await supabase
          .from('inventory')
          .select('product_id, quantity, date')
          .lte('date', maxDate)
          .in('product_id', productIds)
          .range(from, from + PAGE - 1)
        const rows = (data ?? []) as InvRow[]
        invData.push(...rows)
        if (rows.length < PAGE) break
        from += PAGE
      }

      for (const p of products) {
        const lead = (p as { lead_time_days?: number }).lead_time_days ?? 15
        const leadDate = addDaysISO(lead)
        const stock = invData
          .filter(r => r.product_id === p.id && r.date <= leadDate)
          .reduce((sum: number, r: { quantity: number }) => sum + r.quantity, 0)
        const safety = (p as { safety_stock?: number }).safety_stock ?? 100
        if (stock < safety) {
          lowProducts.push({ name: p.name, stock, safety, leadTime: lead })
        }
      }
    }

    // ── Material inventory: D+lead_time per material ──
    const { data: materials } = await supabase
      .from('packaging_materials')
      .select('id, name, unit, safety_stock, lead_time_days')
      .eq('is_active', true)

    const lowMaterials: { name: string; stock: number; safety: number; leadTime: number }[] = []

    if (materials && materials.length > 0) {
      const maxLead = Math.max(...materials.map(m => m.lead_time_days ?? 7))
      const maxDate = addDaysISO(maxLead)
      const materialIds = materials.map(m => m.id)

      // 分頁抓取避免 Supabase 1000 筆 limit 截斷
      type MatInvRow = { material_id: string; quantity: number; date: string }
      const matInvData: MatInvRow[] = []
      const PAGE = 1000
      let from = 0
      while (true) {
        const { data } = await supabase
          .from('packaging_material_inventory')
          .select('material_id, quantity, date')
          .lte('date', maxDate)
          .in('material_id', materialIds)
          .range(from, from + PAGE - 1)
        const rows = (data ?? []) as MatInvRow[]
        matInvData.push(...rows)
        if (rows.length < PAGE) break
        from += PAGE
      }

      for (const mat of materials) {
        const leadDays = mat.lead_time_days ?? 7
        const leadDate = addDaysISO(leadDays)
        const stock = matInvData
          .filter(r => r.material_id === mat.id && r.date <= leadDate)
          .reduce((sum: number, r: { quantity: number }) => sum + r.quantity, 0)

        if (stock < mat.safety_stock) {
          lowMaterials.push({ name: mat.name, stock, safety: mat.safety_stock, leadTime: leadDays })
        }
      }
    }

    // ── No low stock → skip notification ──
    if (lowProducts.length === 0 && lowMaterials.length === 0) {
      return NextResponse.json({ ok: true, message: '所有庫存充足', notified: { products: 0, materials: 0 } })
    }

    // ── Build LINE message ──
    const lines: string[] = ['⚠️ 庫存不足通知', '']

    if (lowProducts.length > 0) {
      lines.push('【產品庫存】預計到貨日不足：')
      for (const p of lowProducts) {
        lines.push(`• ${p.name}(D+${p.leadTime})：${p.stock.toLocaleString()} / 安全 ${p.safety.toLocaleString()}`)
      }
      lines.push('')
    }

    if (lowMaterials.length > 0) {
      lines.push('【包材庫存】預計到貨日不足：')
      for (const m of lowMaterials) {
        lines.push(`• ${m.name}(D+${m.leadTime})：${m.stock.toLocaleString()} / 安全 ${m.safety.toLocaleString()}`)
      }
      lines.push('')
    }

    lines.push(`📅 ${new Date().toLocaleDateString('zh-TW')}`)
    lines.push('— 包裝行事曆系統')

    const message = lines.join('\n')

    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lineToken}`,
      },
      body: JSON.stringify({
        to: lineTargetId,
        messages: [{ type: 'text', text: message }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ error: `LINE API 錯誤: ${errText}` }, { status: res.status })
    }

    return NextResponse.json({
      ok: true,
      notified: { products: lowProducts.length, materials: lowMaterials.length },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '未知錯誤'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
