// 端對端驗證 split + append 混合流程,完整模擬 handleSplitConfirm 寫入。
// 流程:
//   1. 建立 TEST 客戶在 4/30 一筆單 (10 個 經典原味條)
//   2. 模擬 split 5 個到 5/1 + append 7 個到 5/2 (混合呼叫)
//   3. 驗證:
//      - 三筆訂單共 batch_group_id
//      - 4/30 剩 5 個 (split 扣減後)
//      - 5/1 為 split 結果 (5 個)
//      - 5/2 為 append 結果 (7 個,不從原扣)
//      - batch_info = 分批1./2./3. 依日期排序
//   4. 清理全部 TEST 訂單

import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const env = Object.fromEntries(
  (await readFile(new URL('../.env.local', import.meta.url), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]
    }),
)
const h = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

const rest = async (path, init = {}) => {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: { ...h, ...(init.headers || {}) },
  })
  const t = await res.text()
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status}: ${t}`)
  return t ? JSON.parse(t) : null
}

const TEST_NAME = 'TEST_APPEND_FLOW'

// 取一個 cake_bar product 來測
const products = await rest(
  '/products?select=id,name&category=eq.cake_bar&is_active=eq.true&limit=1',
)
const PID = products[0].id
console.log(`Test product: ${products[0].name} (${PID.slice(0, 8)})`)

const cleanup = async () => {
  const existing = await rest(
    `/orders?select=id&customer_name=eq.${encodeURIComponent(TEST_NAME)}`,
  )
  for (const o of existing) {
    await rest(`/order_items?order_id=eq.${o.id}`, { method: 'DELETE' })
    await rest(`/inventory?reference_note=eq.order:${o.id}`, { method: 'DELETE' })
    await rest(`/orders?id=eq.${o.id}`, { method: 'DELETE' })
  }
  if (existing.length > 0) console.log(`已清掉 ${existing.length} 筆遺留 ${TEST_NAME} 訂單`)
}

await cleanup()

// ── 1. 建原訂單 4/30, 10 個 ─────────────────────────
console.log('\n━━ 1. 建原訂單 4/30 ━━')
const orig = await rest('/orders', {
  method: 'POST',
  body: JSON.stringify([
    {
      order_date: '2026-04-30',
      customer_name: TEST_NAME,
      status: '待',
      batch_info: null,
      batch_group_id: null,
      paid: false,
    },
  ]),
})
const origId = orig[0].id
await rest('/order_items', {
  method: 'POST',
  body: JSON.stringify([{ order_id: origId, product_id: PID, quantity: 10 }]),
})
console.log(`✓ 4/30 (${origId.slice(0, 8)}) qty=10`)

// ── 2. 模擬 handleSplitConfirm: split 5 to 5/1, append 7 to 5/2 ──
console.log('\n━━ 2. 模擬 split + append 混合 ━━')
const groupId = randomUUID()
console.log(`batch_group_id = ${groupId.slice(0, 8)}`)

// 建 split 訂單
const splitInsert = await rest('/orders', {
  method: 'POST',
  body: JSON.stringify([
    {
      order_date: '2026-05-01',
      customer_name: TEST_NAME,
      status: '待',
      batch_info: null,
      batch_group_id: groupId,
      paid: false,
    },
  ]),
})
const splitId = splitInsert[0].id
await rest('/order_items', {
  method: 'POST',
  body: JSON.stringify([{ order_id: splitId, product_id: PID, quantity: 5 }]),
})
console.log(`✓ split → 5/1 (${splitId.slice(0, 8)}) qty=5`)

// 建 append 訂單
const appendInsert = await rest('/orders', {
  method: 'POST',
  body: JSON.stringify([
    {
      order_date: '2026-05-02',
      customer_name: TEST_NAME,
      status: '待',
      batch_info: null,
      batch_group_id: groupId,
      paid: false,
    },
  ]),
})
const appendId = appendInsert[0].id
await rest('/order_items', {
  method: 'POST',
  body: JSON.stringify([{ order_id: appendId, product_id: PID, quantity: 7 }]),
})
console.log(`✓ append → 5/2 (${appendId.slice(0, 8)}) qty=7`)

// 更新原訂單:扣 split 後 = 10-5=5,綁 group_id
await rest(`/orders?id=eq.${origId}`, {
  method: 'PATCH',
  body: JSON.stringify({ batch_group_id: groupId }),
})
await rest(`/order_items?order_id=eq.${origId}`, { method: 'DELETE' })
await rest('/order_items', {
  method: 'POST',
  body: JSON.stringify([{ order_id: origId, product_id: PID, quantity: 5 }]),
})
console.log(`✓ 4/30 (orig) qty: 10 → 5 (扣 split 5)、綁 group_id`)

// 重編號 batch_info
const inGroup = await rest(
  `/orders?select=id,order_date&batch_group_id=eq.${groupId}&order=order_date.asc`,
)
for (let i = 0; i < inGroup.length; i++) {
  await rest(`/orders?id=eq.${inGroup[i].id}`, {
    method: 'PATCH',
    body: JSON.stringify({ batch_info: `分批${i + 1}.` }),
  })
}
console.log(`✓ 重編號 batch_info: ${inGroup.length} 筆`)

// ── 3. 驗證 ──────────────────────────────────────
console.log('\n━━ 3. 驗證 ━━')
const final = await rest(
  `/orders?select=id,order_date,batch_info,batch_group_id,order_items(quantity,product_id)&customer_name=eq.${encodeURIComponent(TEST_NAME)}&order=order_date.asc`,
)

let pass = true
const expectations = [
  { date: '2026-04-30', batch_info: '分批1.', qty: 5, role: '原訂單(扣後)' },
  { date: '2026-05-01', batch_info: '分批2.', qty: 5, role: 'split' },
  { date: '2026-05-02', batch_info: '分批3.', qty: 7, role: 'append' },
]

for (let i = 0; i < expectations.length; i++) {
  const exp = expectations[i]
  const got = final[i]
  const gotQty = got.order_items.reduce((s, it) => s + it.quantity, 0)
  const ok =
    got.order_date === exp.date &&
    got.batch_info === exp.batch_info &&
    got.batch_group_id === groupId &&
    gotQty === exp.qty
  console.log(
    `  ${ok ? '✓' : '✗'} ${exp.role}: ${got.order_date}=${exp.date}, ${got.batch_info}=${exp.batch_info}, qty ${gotQty}=${exp.qty}, group ${got.batch_group_id?.slice(0, 8)}=${groupId.slice(0, 8)}`,
  )
  if (!ok) pass = false
}

const groupIds = new Set(final.map((o) => o.batch_group_id))
if (groupIds.size === 1 && [...groupIds][0] === groupId) {
  console.log('  ✓ 三筆訂單共用同一個 batch_group_id')
} else {
  console.log(`  ✗ batch_group_id 不一致: ${[...groupIds].join(',')}`)
  pass = false
}

// ── 4. 清理 ──────────────────────────────────────
console.log('\n━━ 4. 清理 ━━')
await cleanup()
console.log('✓ 已刪除 TEST_APPEND_FLOW 全部訂單')

console.log('\n' + (pass ? '🎉 全部通過' : '❌ 有失敗'))
process.exit(pass ? 0 : 1)
