// 一次性資料修復:把所有「同名同姓」的訂單綁同一個 batch_group_id
// 並依 order_date ASC, created_at ASC 重編號 batch_info = 分批1./2./3./...
//
// 觸發條件:user 已人工確認「同名同姓的就是同一位客戶」。
// 規則:
//   - 同 customer_name 且 ≥ 2 筆 → 視為同人,綁同 group。
//   - 該客戶若已有任一訂單帶 batch_group_id,沿用該值;否則新建 UUID。
//   - 單筆訂單的客戶不動(無兄弟可綁)。
//   - batch_info 整批被覆寫為「分批N.」(原本手寫的「追加」「備註」會被吃掉,
//     user 已知悉)。
//
// 用法:
//   node scripts/bind-same-name-customers.mjs              # dry-run,只印不動
//   node scripts/bind-same-name-customers.mjs --apply      # 實際寫入

import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const APPLY = process.argv.includes('--apply')

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
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

console.log(`Mode: ${APPLY ? '🔥 APPLY (寫入)' : '🔍 DRY-RUN (僅預覽)'}`)
console.log('───────────────────────────────────────')

// ── 0. 確認 migration 021 已套用(notes column 存在) ────
try {
  await rest('/orders?select=notes&limit=1')
} catch (e) {
  console.error(
    '❌ orders.notes column 不存在 — 請先到 Supabase Dashboard 執行 migration 021_orders_notes.sql',
  )
  console.error(`   錯誤訊息: ${e.message}`)
  process.exit(1)
}

// ── 1. 撈所有訂單 ─────────────────────────────────────
const all = await rest(
  '/orders?select=id,order_date,customer_name,batch_info,batch_group_id,notes,created_at&order=customer_name.asc,order_date.asc,created_at.asc',
)
console.log(`總訂單數: ${all.length}`)

// ── 2. 依 customer_name 分組 ──────────────────────────
const groups = new Map()
for (const o of all) {
  const k = o.customer_name
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(o)
}

// ── 3. 過濾 ≥ 2 筆的客戶 ──────────────────────────────
const targets = [...groups.entries()].filter(([, list]) => list.length >= 2)
console.log(`同名 ≥2 筆的客戶: ${targets.length} 個 (其餘 ${groups.size - targets.length} 個單筆,跳過)`)
console.log('───────────────────────────────────────')

let totalChanges = 0
const results = []

for (const [name, list] of targets) {
  // sort by date asc, then created_at asc
  list.sort((a, b) => {
    const d = a.order_date.localeCompare(b.order_date)
    if (d !== 0) return d
    return (a.created_at ?? '').localeCompare(b.created_at ?? '')
  })

  // pick existing UUID or generate new
  const existing = [...new Set(list.map((o) => o.batch_group_id).filter(Boolean))]
  const groupId = existing[0] ?? randomUUID()
  const isNew = existing.length === 0

  console.log(
    `\n• ${name} — ${list.length} 筆 — group=${groupId.slice(0, 8)}${isNew ? ' (新建 UUID)' : ' (沿用既有)'}`,
  )

  // 純「分批N」「分批N.」(無其他文字) 視為可安全覆寫,其他原文要保留到 notes
  const isPureBatchPattern = (s) => /^分批\d+\.?$/.test((s ?? '').trim())

  for (let i = 0; i < list.length; i++) {
    const o = list[i]
    const newBatchInfo = `分批${i + 1}.`
    const needsGroupChange = o.batch_group_id !== groupId
    const needsBatchInfoChange = o.batch_info !== newBatchInfo

    // 是否要把原 batch_info 搬到 notes:有非純編號字串、且 notes 還是空
    const shouldArchiveToNotes =
      o.batch_info && !isPureBatchPattern(o.batch_info) && !o.notes
    const willChange = needsGroupChange || needsBatchInfoChange || shouldArchiveToNotes

    const noteMark = shouldArchiveToNotes ? ` ⓘ archive→notes:"${o.batch_info}"` : ''
    const change =
      `    ${o.order_date} | ${o.id.slice(0, 8)} | ` +
      `batch_info: ${o.batch_info ?? 'null'} → ${newBatchInfo} | ` +
      `group: ${o.batch_group_id ? o.batch_group_id.slice(0, 8) : 'null'} → ${groupId.slice(0, 8)}` +
      noteMark +
      ` ${willChange ? '✏️' : '(無變動)'}`
    console.log(change)

    if (willChange) totalChanges++

    if (APPLY && willChange) {
      const patch = {
        batch_group_id: groupId,
        batch_info: newBatchInfo,
      }
      if (shouldArchiveToNotes) patch.notes = o.batch_info
      await rest(`/orders?id=eq.${o.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
    }
  }

  results.push({ name, count: list.length, groupId, isNew })
}

console.log('\n═══════════════════════════════════════')
console.log(`📊 摘要`)
console.log(`  涉及客戶: ${targets.length} 個`)
console.log(`  涉及訂單: ${targets.reduce((s, [, l]) => s + l.length, 0)} 筆`)
console.log(`  實際變動: ${totalChanges} 筆 (其餘已是正確狀態)`)
console.log(
  `  新建 UUID: ${results.filter((r) => r.isNew).length} 個 / 沿用既有: ${results.filter((r) => !r.isNew).length} 個`,
)
console.log(APPLY ? '\n✅ 已寫入資料庫' : '\n💡 預覽完畢。確認無誤請加 --apply 旗標再跑一次。')
