// 檢查 product_recipe 配方表是否有異常。
//
// 期望規則(從 LAD.md):
//   - cake (盒): 1 盒 = 2 條 cake_bar
//     · 雙口味(A+B): 各 1 條 = 兩筆 recipe(A 條 1, B 條 1)
//     · 單口味(A): 2 條 A = 一筆 recipe(A 條 2) 或兩筆(各 1)
//   - tube (筒): 1 筒 = 1 條 對應口味 cake_bar (一筆 recipe)
//   - single_cake (單入): 1 個 = 0.25 條 對應口味 cake_bar (一筆 recipe)
//   - cookie / cake_bar / tube_pkg: 無 recipe
//
// 比對 cake_bar 名稱時注意「（條）」後綴。

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

const products = await rest('/products?select=id,name,category,is_active,sort_order&order=category,sort_order')
const recipes = await rest('/product_recipe?select=id,product_id,ingredient_id,quantity_per_unit')

const byId = new Map(products.map((p) => [p.id, p]))
const byCategory = new Map()
for (const p of products) {
  if (!byCategory.has(p.category)) byCategory.set(p.category, [])
  byCategory.get(p.category).push(p)
}

// 條 → 口味 (剝「（條）」)
const stripBar = (n) => n.replace(/（條）$/, '').trim()
const cakeBarByFlavor = new Map()
for (const p of byCategory.get('cake_bar') || []) {
  cakeBarByFlavor.set(stripBar(p.name), p)
}

const issues = []
const flag = (sev, prod, msg) => issues.push({ sev, prod, msg })

console.log(`Products: ${products.length} | Recipes: ${recipes.length}`)
console.log(`cake_bar 口味: ${[...cakeBarByFlavor.keys()].join(' / ')}`)
console.log('───────────────────────────────────────')

// 預期應有 recipe 的類別
const RECIPE_CATEGORIES = new Set(['cake', 'tube', 'single_cake'])
// 預期應無 recipe 的類別
const NO_RECIPE_CATEGORIES = new Set(['cake_bar', 'cookie', 'tube_pkg'])

// ── 1. 對每個產品檢查 ──────────────────────────────
for (const p of products) {
  if (!p.is_active) continue
  const myRecipes = recipes.filter((r) => r.product_id === p.id)

  // 不應有 recipe 的類別
  if (NO_RECIPE_CATEGORIES.has(p.category)) {
    if (myRecipes.length > 0) {
      flag('ERR', p, `不該有 recipe(${p.category})卻有 ${myRecipes.length} 筆`)
    }
    continue
  }
  if (!RECIPE_CATEGORIES.has(p.category)) continue

  // 應有 recipe 但沒有
  if (myRecipes.length === 0) {
    flag('ERR', p, `缺 recipe(${p.category} 必須有原料配方)`)
    continue
  }

  // ── 推導預期口味 + 數量 ──
  // 試吃品項屬混合配方,只驗總量不驗口味
  const isSample = p.name.includes('試吃')
  let expectedFlavorQty = new Map() // flavor name → qty needed
  let expectedTotal = null // 試吃用,期望 cake_bar 總和
  const name = p.name
  if (p.category === 'cake') {
    if (isSample) {
      expectedTotal = 2 // 1 盒 = 2 條
    } else if (name.includes('+')) {
      for (const f of name.split('+')) expectedFlavorQty.set(f.trim(), 1)
    } else {
      expectedFlavorQty.set(name.trim(), 2)
    }
  } else if (p.category === 'tube') {
    if (isSample) {
      expectedTotal = 1 // 1 筒 = 1 條
    } else {
      const f = name.replace(/^旋轉筒-/, '').trim()
      expectedFlavorQty.set(f, 1)
    }
  } else if (p.category === 'single_cake') {
    if (isSample) {
      expectedTotal = 0.25
    } else {
      const f = name.replace(/^單入-/, '').trim()
      expectedFlavorQty.set(f, 0.25)
    }
  }

  // ── 把 myRecipes 按 flavor 累加 ──
  const actualFlavorQty = new Map()
  let hasInvalidIngredient = false
  for (const r of myRecipes) {
    const ing = byId.get(r.ingredient_id)
    if (!ing) {
      flag('ERR', p, `recipe ingredient_id=${r.ingredient_id} 不存在`)
      hasInvalidIngredient = true
      continue
    }
    if (ing.category !== 'cake_bar' && ing.category !== 'tube_pkg') {
      flag('ERR', p, `recipe ingredient「${ing.name}」分類為 ${ing.category},應為 cake_bar 或 tube_pkg`)
      hasInvalidIngredient = true
      continue
    }
    if (ing.category === 'tube_pkg') {
      flag('WARN', p, `recipe 含 tube_pkg「${ing.name}」— LAD 註明 tube_pkg 應靠硬編碼處理,不入 recipe`)
    }
    if (!ing.is_active) {
      flag('WARN', p, `recipe 指向已停用品項「${ing.name}」`)
    }
    const flavor = ing.category === 'cake_bar' ? stripBar(ing.name) : ing.name
    actualFlavorQty.set(flavor, (actualFlavorQty.get(flavor) || 0) + Number(r.quantity_per_unit))
  }
  if (hasInvalidIngredient) continue

  // ── 比對期望 vs 實際 ──
  if (expectedTotal !== null) {
    // 試吃品項:只驗總量
    const total = [...actualFlavorQty.values()].reduce((s, q) => s + q, 0)
    if (Math.abs(total - expectedTotal) > 1e-9) {
      flag('ERR', p, `試吃品項 cake_bar 總量期望 ${expectedTotal} 條,實際 ${total} 條`)
    }
  } else {
    for (const [f, exp] of expectedFlavorQty) {
      const act = actualFlavorQty.get(f) || 0
      if (Math.abs(act - exp) > 1e-9) {
        flag('ERR', p, `口味「${f}」期望 ${exp},實際 ${act}`)
      }
      if (!cakeBarByFlavor.has(f)) {
        flag('ERR', p, `推導出口味「${f}」但找不到對應 cake_bar 品項`)
      }
    }
    for (const [f, act] of actualFlavorQty) {
      if (!expectedFlavorQty.has(f)) {
        flag('ERR', p, `recipe 含未預期口味「${f}」(qty=${act})`)
      }
    }
  }
}

// ── 2. 對 recipe 表本身檢查 ──
const seen = new Map()
for (const r of recipes) {
  const key = `${r.product_id}::${r.ingredient_id}`
  if (seen.has(key)) {
    const p = byId.get(r.product_id)
    flag('WARN', p, `重複 recipe(同 product+ingredient 出現多次,可合併)`)
  } else {
    seen.set(key, r)
  }
  if (Number(r.quantity_per_unit) <= 0) {
    const p = byId.get(r.product_id)
    flag('ERR', p, `quantity_per_unit=${r.quantity_per_unit} ≤ 0`)
  }
}

// ── 3. 找有訂單但沒 recipe 的 cake/tube/single_cake ─
// (上面已涵蓋,跳過)

// ── 報告 ────────────────────────────────────────
const errs = issues.filter((i) => i.sev === 'ERR')
const warns = issues.filter((i) => i.sev === 'WARN')

console.log(`\n📊 問題統計: ${errs.length} 錯誤 / ${warns.length} 警告\n`)

if (errs.length === 0 && warns.length === 0) {
  console.log('✅ 配方無異常')
  process.exit(0)
}

const groupByProd = new Map()
for (const i of issues) {
  const k = i.prod ? `[${i.prod.category}] ${i.prod.name}` : '(未指定)'
  if (!groupByProd.has(k)) groupByProd.set(k, [])
  groupByProd.get(k).push(i)
}

for (const [name, list] of groupByProd) {
  console.log(`• ${name}`)
  for (const i of list) {
    console.log(`    ${i.sev === 'ERR' ? '❌' : '⚠️ '} ${i.msg}`)
  }
}

// ── 4. 輸出全部 recipe 給人眼看 ────────────────────
console.log('\n═══ 所有 recipe(供人工複核) ═══')
const cakeProducts = (byCategory.get('cake') || [])
  .concat(byCategory.get('tube') || [])
  .concat(byCategory.get('single_cake') || [])
  .filter((p) => p.is_active)
  .sort((a, b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order)
for (const p of cakeProducts) {
  const my = recipes.filter((r) => r.product_id === p.id)
  if (my.length === 0) {
    console.log(`  [${p.category}] ${p.name} — (無 recipe)`)
    continue
  }
  const parts = my.map((r) => {
    const ing = byId.get(r.ingredient_id)
    return `${ing?.name ?? '?'} × ${r.quantity_per_unit}`
  })
  console.log(`  [${p.category}] ${p.name} → ${parts.join(' + ')}`)
}

process.exit(errs.length > 0 ? 1 : 0)
