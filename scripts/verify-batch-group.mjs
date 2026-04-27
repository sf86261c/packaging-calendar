// 驗證 migration 020 + batch_group_id 邏輯,並清理上一輪測試殘單。
// 用 service role key 直連 Supabase REST API,不依賴 Next.js dev server。
//
// 流程：
//   1. 讀取 .env.local
//   2. 確認 batch_group_id column 已存在(migration 020 應用)
//   3. 找出 4/29 黃莉軒 測試殘單,印出
//   4. 建立測試客戶 "TEST_BATCH_VERIFY" 在 4/30 / 5/1 / 5/2 共三筆,
//      指派同一個 batch_group_id(模擬 handleSplitConfirm 行為)
//   5. 建立同名 "TEST_BATCH_VERIFY" 但 batch_group_id=null 的訂單在 5/3
//      (模擬「同名同姓但不同人,沒按分批按鈕」)
//   6. 查詢 batch_group_id = ? → 應該回傳 4/30 / 5/1 / 5/2 三筆
//      不應該包含 5/3 的同名訂單
//   7. 全部清掉:測試客戶四筆 + 4/29 黃莉軒殘單

import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const envText = await readFile(new URL('../.env.local', import.meta.url), 'utf8')
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=')
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')]
    }),
)

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

async function rest(path, init = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`${init.method || 'GET'} ${path} → ${res.status}: ${text}`)
  }
  return text ? JSON.parse(text) : null
}

const TEST_NAME = 'TEST_BATCH_VERIFY'

// ── 1. 確認 batch_group_id column 存在 ─────────────────
console.log('━━ Step 1: 確認 migration 020 已套用 ━━')
const probe = await rest('/orders?select=id,batch_group_id&limit=1')
console.log('  ✓ orders.batch_group_id column 可讀,migration 020 已生效')

// 取一個 product 用於測試 (隨便撈一個 active 的)
const products = await rest(
  '/products?select=id,name,category&is_active=eq.true&category=eq.cake_bar&order=sort_order&limit=1',
)
if (products.length === 0) throw new Error('找不到 cake_bar product')
const testProductId = products[0].id
console.log(`  ✓ 測試用品項: ${products[0].name} (id=${testProductId})`)

// ── 2. 撈 4/29 黃莉軒殘單 ─────────────────────────────
console.log('\n━━ Step 2: 找出 4/29 黃莉軒測試殘單 ━━')
const huangOrders = await rest(
  `/orders?select=id,order_date,customer_name,batch_info,batch_group_id&customer_name=eq.${encodeURIComponent('黃莉軒')}&order_date=eq.2026-04-29`,
)
console.log(`  找到 ${huangOrders.length} 筆 4/29 黃莉軒:`)
for (const o of huangOrders) {
  console.log(
    `    - ${o.id.slice(0, 8)} | batch_info=${o.batch_info} | group_id=${o.batch_group_id ?? 'null'}`,
  )
}

// ── 3. 建立測試批次 (同 UUID) ─────────────────────────
console.log('\n━━ Step 3: 建立測試批次 — TEST_BATCH_VERIFY × 3 dates ━━')
const groupId = randomUUID()
console.log(`  batch_group_id = ${groupId}`)

const dates = ['2026-04-30', '2026-05-01', '2026-05-02']
const createdIds = []
for (let i = 0; i < dates.length; i++) {
  const d = dates[i]
  const payload = [
    {
      order_date: d,
      customer_name: TEST_NAME,
      status: '待',
      batch_info: `分批${i + 1}.`,
      batch_group_id: groupId,
      paid: false,
    },
  ]
  const inserted = await rest('/orders', { method: 'POST', body: JSON.stringify(payload) })
  const orderId = inserted[0].id
  createdIds.push(orderId)
  // 加一筆 item
  await rest('/order_items', {
    method: 'POST',
    body: JSON.stringify([
      { order_id: orderId, product_id: testProductId, quantity: i + 1 },
    ]),
  })
  console.log(`  ✓ ${d} 訂單建立 (${orderId.slice(0, 8)}, qty=${i + 1})`)
}

// ── 4. 建立同名但獨立 (group_id=null) 的訂單 ─────────
console.log('\n━━ Step 4: 建立同名但獨立的訂單 (5/3, group_id=null) ━━')
const independentInsert = await rest('/orders', {
  method: 'POST',
  body: JSON.stringify([
    {
      order_date: '2026-05-03',
      customer_name: TEST_NAME,
      status: '待',
      batch_info: null,
      batch_group_id: null,
      paid: false,
    },
  ]),
})
const independentId = independentInsert[0].id
await rest('/order_items', {
  method: 'POST',
  body: JSON.stringify([{ order_id: independentId, product_id: testProductId, quantity: 99 }]),
})
console.log(`  ✓ 5/3 同名獨立訂單 (${independentId.slice(0, 8)}, qty=99)`)

// ── 5. 用 batch_group_id 查 sibling — 應只回 3 筆 ─────
console.log('\n━━ Step 5: 驗證 sibling 查詢只回 batch group 內的訂單 ━━')
const groupOrders = await rest(
  `/orders?select=id,order_date,batch_info,customer_name&batch_group_id=eq.${groupId}&order=order_date.asc`,
)
console.log(`  查 batch_group_id=${groupId.slice(0, 8)} → 回 ${groupOrders.length} 筆:`)
for (const o of groupOrders) {
  console.log(`    - ${o.order_date} | ${o.batch_info} | ${o.customer_name}`)
}

// 同時用「customer_name=TEST_BATCH_VERIFY」舊邏輯查,應回 4 筆(含 5/3)
const allByName = await rest(
  `/orders?select=id,order_date,batch_info,batch_group_id&customer_name=eq.${TEST_NAME}&order=order_date.asc`,
)
console.log(`\n  對照組:用 customer_name 查 → 回 ${allByName.length} 筆 (舊邏輯會誤判):`)
for (const o of allByName) {
  console.log(
    `    - ${o.order_date} | batch_info=${o.batch_info} | group=${o.batch_group_id ? o.batch_group_id.slice(0, 8) : 'null'}`,
  )
}

// ── 6. 斷言 ──────────────────────────────────────────
console.log('\n━━ Step 6: 斷言 ━━')
let pass = true
if (groupOrders.length !== 3) {
  console.error(`  ✗ FAIL: 期待 3 筆 batch_group siblings, 實得 ${groupOrders.length}`)
  pass = false
} else {
  console.log('  ✓ batch_group_id 查詢回傳 3 筆 (4/30 / 5/1 / 5/2)')
}
if (groupOrders.some((o) => o.order_date === '2026-05-03')) {
  console.error('  ✗ FAIL: batch_group siblings 不應包含 5/3 (group_id=null 的同名訂單)')
  pass = false
} else {
  console.log('  ✓ 5/3 同名獨立訂單未被誤合併到 batch group ✅ (核心驗證)')
}
if (allByName.length !== 4) {
  console.error(`  ✗ FAIL: 期待 4 筆同名訂單 (3 batch + 1 獨立), 實得 ${allByName.length}`)
  pass = false
} else {
  console.log('  ✓ 同名訂單共 4 筆,但 batch_group_id 只把 3 筆綁在一起')
}

// ── 7. 清理測試殘單 ──────────────────────────────────
console.log('\n━━ Step 7: 清理 ━━')

// 清測試客戶 4 筆
for (const id of [...createdIds, independentId]) {
  // delete order_items first (no cascade assumed)
  await rest(`/order_items?order_id=eq.${id}`, { method: 'DELETE' })
  await rest(`/orders?id=eq.${id}`, { method: 'DELETE' })
  console.log(`  ✓ 已刪除測試訂單 ${id.slice(0, 8)}`)
}

// 清 4/29 黃莉軒殘單
for (const o of huangOrders) {
  // 順便清掉這筆訂單寫過的 inventory 記錄
  await rest(`/inventory?reference_note=eq.order:${o.id}`, { method: 'DELETE' })
  await rest(`/packaging_material_inventory?reference_note=eq.order:${o.id}`, {
    method: 'DELETE',
  })
  await rest(`/order_items?order_id=eq.${o.id}`, { method: 'DELETE' })
  await rest(`/orders?id=eq.${o.id}`, { method: 'DELETE' })
  console.log(`  ✓ 已刪除 4/29 黃莉軒殘單 ${o.id.slice(0, 8)} (含 inventory)`)
}

console.log('\n' + (pass ? '🎉 全部驗證通過 + 清理完成' : '⚠️  驗證有失敗項,請檢查'))
process.exit(pass ? 0 : 1)
