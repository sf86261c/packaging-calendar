// 驗證同名同姓綁定後的資料庫狀態。重點確認:
//   1. 14 位客戶都拿到 batch_group_id (非 null)
//   2. 3 位有原文備註的客戶 notes 已存
//   3. batch_info 全部為「分批N.」格式

import { readFile } from 'node:fs/promises'

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
}

const targetNames = [
  '張子馨', '施怡姍', '曾絲語', '曾莉涵', '曾麗因', '林怡杏', '洛婕',
  '潘郁伶', '王愈雯', '董庭瑄', '鄒心悅', '鄭如芸', '陳立欣', '高筱婷',
]
const inList = '(' + targetNames.map((n) => encodeURIComponent(n)).join(',') + ')'
const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/orders?select=customer_name,order_date,batch_info,batch_group_id,notes&customer_name=in.${inList}&order=customer_name.asc,order_date.asc`

const data = await fetch(url, { headers: h }).then((r) => r.json())

const byCustomer = new Map()
for (const o of data) {
  if (!byCustomer.has(o.customer_name)) byCustomer.set(o.customer_name, [])
  byCustomer.get(o.customer_name).push(o)
}

let pass = true
const issues = []
for (const [name, list] of byCustomer) {
  const groupIds = new Set(list.map((o) => o.batch_group_id))
  const allHaveGroup = list.every((o) => o.batch_group_id)
  const allSameGroup = groupIds.size === 1
  const correctNumbering = list.every((o, i) => o.batch_info === `分批${i + 1}.`)

  console.log(`• ${name} — ${list.length} 筆 — group=${[...groupIds][0]?.slice(0, 8) ?? 'null'}`)
  for (const o of list) {
    console.log(
      `    ${o.order_date} | ${o.batch_info} | notes=${o.notes ?? '-'}`,
    )
  }
  if (!allHaveGroup) {
    issues.push(`${name}: 有訂單 batch_group_id 仍是 null`)
    pass = false
  }
  if (!allSameGroup) {
    issues.push(`${name}: 同客戶有 ${groupIds.size} 個不同 group_id`)
    pass = false
  }
  if (!correctNumbering) {
    issues.push(`${name}: batch_info 編號未連續為「分批1./2./...」`)
    pass = false
  }
}

console.log('\n══════════════════════════════════')
console.log(`涉及訂單總數: ${data.length}`)
const withNotes = data.filter((o) => o.notes)
console.log(`已歸檔到 notes 的訂單: ${withNotes.length} 筆`)
for (const o of withNotes) {
  console.log(`  - ${o.customer_name} ${o.order_date}: notes="${o.notes}"`)
}

if (pass) {
  console.log('\n✅ 全部通過')
} else {
  console.log('\n❌ 發現問題:')
  for (const i of issues) console.log(`  - ${i}`)
  process.exit(1)
}
