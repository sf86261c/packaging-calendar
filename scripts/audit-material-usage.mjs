// 檢查 product_material_usage 包材扣減對照表是否有「同類產品 A 扣這些、B 少扣其中之一」的異常。
//
// 邏輯:
//   1. 撈所有 active product / packaging_style / packaging_material / product_material_usage
//   2. 對每筆「product × packaging_style」組合,列出會扣到的包材清單
//      (含精確匹配 packaging_style_id + 通用 null 兩種)
//   3. 將同 category 的產品做集合對照:用「(packaging_style, material) × qty」
//      作為扣減 fingerprint,找出 fingerprint 集合的差異
//   4. 印出每個產品的扣減 footprint + 標出可能漏掉的包材

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
const rest = async (p) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1${p}`, { headers: h })
  if (!r.ok) throw new Error(`${p} → ${r.status}`)
  return r.json()
}

const [products, pkgStyles, materials, usages] = await Promise.all([
  rest('/products?select=id,name,category,is_active,sort_order&order=category,sort_order'),
  rest('/packaging_styles?select=id,name,category,is_active'),
  rest('/packaging_materials?select=id,name,is_active'),
  rest('/product_material_usage?select=id,product_id,packaging_style_id,material_id,quantity_per_unit'),
])

const productById = new Map(products.map((p) => [p.id, p]))
const pkgById = new Map(pkgStyles.map((s) => [s.id, s]))
const matById = new Map(materials.map((m) => [m.id, m]))

// 該產品扣減的「指紋」:每個 packaging context 對應一組 (material, qty) 集合
//   key = packaging_style_id (or '*' for 通用 null) → value = list of {materialName, qty}
function computeFootprint(productId) {
  const my = usages.filter((u) => u.product_id === productId)
  const byPkg = new Map()
  for (const u of my) {
    const pkgKey = u.packaging_style_id ?? '*'
    const matName = matById.get(u.material_id)?.name ?? `?(${u.material_id})`
    if (!byPkg.has(pkgKey)) byPkg.set(pkgKey, [])
    byPkg.get(pkgKey).push({ matName, qty: Number(u.quantity_per_unit) })
  }
  // sort each pkg group by material name
  for (const [, list] of byPkg) {
    list.sort((a, b) => a.matName.localeCompare(b.matName))
  }
  return byPkg
}

const formatFootprint = (fp) => {
  if (fp.size === 0) return '(無 usage)'
  const out = []
  for (const [pkgKey, list] of [...fp.entries()].sort()) {
    const pkgName = pkgKey === '*' ? '【通用,null】' : pkgById.get(pkgKey)?.name ?? `?(${pkgKey.slice(0, 8)})`
    const items = list.map((i) => `${i.matName}×${i.qty}`).join(' + ')
    out.push(`    [${pkgName}] ${items}`)
  }
  return out.join('\n')
}

console.log(`Products active: ${products.filter((p) => p.is_active).length}`)
console.log(`Packaging styles: ${pkgStyles.length}`)
console.log(`Materials: ${materials.length} (active=${materials.filter((m) => m.is_active).length})`)
console.log(`Usage entries: ${usages.length}`)
console.log('───────────────────────────────────────')

// ── 主視圖:每個產品在每個 packaging 下會扣什麼 ───
const RELEVANT_CATEGORIES = new Set(['cake', 'tube', 'single_cake', 'cookie'])
const issues = []
const flag = (sev, msg) => issues.push({ sev, msg })

const grouped = new Map()
for (const p of products) {
  if (!p.is_active) continue
  if (!RELEVANT_CATEGORIES.has(p.category)) continue
  if (!grouped.has(p.category)) grouped.set(p.category, [])
  grouped.get(p.category).push(p)
}

for (const [cat, list] of [...grouped.entries()].sort()) {
  console.log(`\n═══ Category: ${cat} (${list.length} 個品項) ═══`)
  // 計算每個產品 footprint
  const fps = list.map((p) => ({ product: p, fp: computeFootprint(p.id) }))

  // 計算這個 category 在每個 packaging context 下「應該」扣哪些 material
  // 取每個 (pkgKey, matName) 在多少個產品中出現,作為基準
  const occurrenceByContext = new Map() // pkgKey → matName → set of productIds
  for (const { product, fp } of fps) {
    for (const [pkgKey, items] of fp) {
      if (!occurrenceByContext.has(pkgKey)) occurrenceByContext.set(pkgKey, new Map())
      const matMap = occurrenceByContext.get(pkgKey)
      for (const { matName } of items) {
        if (!matMap.has(matName)) matMap.set(matName, new Set())
        matMap.get(matName).add(product.id)
      }
    }
  }

  for (const { product, fp } of fps) {
    console.log(`\n• ${product.name}`)
    if (fp.size === 0) {
      console.log('    (沒有任何 product_material_usage 對照)')
      // tube_pkg / cake_bar / cookie 視類別判斷是否合理
      flag('WARN', `${product.name}(${cat}) 完全沒有 material usage`)
      continue
    }
    console.log(formatFootprint(fp))

    // 對照同 category 同 packaging context 下,我有哪些 material 沒出現,但其他產品有
    for (const [pkgKey, items] of fp) {
      const matsHere = new Set(items.map((i) => i.matName))
      const matMap = occurrenceByContext.get(pkgKey)
      if (!matMap) continue
      for (const [matName, productSet] of matMap) {
        if (matsHere.has(matName)) continue
        // 只標出「絕大多數同類產品都有」的 material
        const ratio = productSet.size / list.length
        if (ratio >= 0.5 && productSet.size >= 2) {
          const pkgName = pkgKey === '*' ? '通用' : pkgById.get(pkgKey)?.name ?? '?'
          const otherProds = [...productSet].map((id) => productById.get(id)?.name).filter(Boolean).slice(0, 3)
          flag(
            'WARN',
            `${product.name}(${cat}) 在 [${pkgName}] 沒扣「${matName}」,但同類別 ${productSet.size}/${list.length} 個都有扣(例:${otherProds.join('、')})`,
          )
        }
      }
    }
  }
}

// ── 額外檢查:無效或停用引用 ────────────────────
for (const u of usages) {
  const p = productById.get(u.product_id)
  if (!p) {
    flag('ERR', `usage id=${u.id} product_id=${u.product_id} 不存在`)
    continue
  }
  if (!p.is_active) {
    flag('WARN', `usage 指向已停用品項「${p.name}」`)
  }
  const m = matById.get(u.material_id)
  if (!m) flag('ERR', `usage 指向不存在的 material(${u.material_id})`)
  else if (!m.is_active) flag('WARN', `usage 指向已停用包材「${m.name}」(by ${p?.name})`)
  if (u.packaging_style_id) {
    const ps = pkgById.get(u.packaging_style_id)
    if (!ps) flag('ERR', `usage 指向不存在的 packaging_style`)
    else if (!ps.is_active) flag('WARN', `usage 指向已停用包裝款式「${ps.name}」(by ${p?.name})`)
  }
  if (Number(u.quantity_per_unit) <= 0) {
    flag('ERR', `usage(${p?.name})quantity_per_unit=${u.quantity_per_unit} ≤ 0`)
  }
}

// ── 報告 ─────────────────────────────────────
const errs = issues.filter((i) => i.sev === 'ERR')
const warns = issues.filter((i) => i.sev === 'WARN')
console.log(`\n═══════════════════════════════════════`)
console.log(`📊 ${errs.length} 錯誤 / ${warns.length} 警告`)
if (errs.length) {
  console.log('\n❌ 錯誤:')
  for (const i of errs) console.log(`  - ${i.msg}`)
}
if (warns.length) {
  console.log('\n⚠️  警告(疑似漏扣或需人工確認):')
  for (const i of warns) console.log(`  - ${i.msg}`)
}
if (errs.length === 0 && warns.length === 0) {
  console.log('\n✅ 包材扣減無明顯異常')
}
process.exit(errs.length ? 1 : 0)
