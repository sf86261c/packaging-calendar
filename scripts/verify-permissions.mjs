// 驗證 src/lib/permissions.ts 的權限判斷純函式。
//
// 對應業主 2026-07-28 裁決：
//   - 庫存頁「可編輯」= 只有入庫與數量修正（canEditStock）
//   - 其餘庫存動作（包材/分類 CRUD、水源轉移、排序、叫貨通知）僅管理員（canAdminInventory）
//   - 紀錄頁 view = 只看自己、edit = 看全部（canViewAllActivity）
//   - 設定頁維持僅管理員
//
// Node 24 可直接 import .ts（type stripping），故不需測試框架。
// 執行：node scripts/verify-permissions.mjs

const {
  getPageMode,
  canAccessPage,
  canEditPage,
  canViewPage,
  canUseStockAdjustment,
  canUseCalendarOrders,
  canEditStock,
  canAdminInventory,
  canViewAllActivity,
} = await import('../src/lib/permissions.ts')

// ─── 測試對象：對齊 settings 頁 PRESET_PERMS 的四個預設角色 ───────────
const admin = { id: 'a', username: 'admin', is_admin: true, permissions: {} }

const operator = {
  id: 'o',
  username: 'operator',
  is_admin: false,
  permissions: { calendar: 'edit', dashboard: 'view', inventory: 'edit', activity: 'view', settings: 'none' },
}

const viewer = {
  id: 'v',
  username: 'viewer',
  is_admin: false,
  permissions: { calendar: 'view', dashboard: 'view', inventory: 'view', activity: 'view', settings: 'none' },
}

const salesOnly = {
  id: 's',
  username: 'sales',
  is_admin: false,
  permissions: { calendar: 'adjustment_only', dashboard: 'none', inventory: 'none', activity: 'none', settings: 'none' },
}

// 紀錄頁給 edit 的自訂角色（看全部）
const auditor = {
  id: 'u',
  username: 'auditor',
  is_admin: false,
  permissions: { calendar: 'none', dashboard: 'none', inventory: 'view', activity: 'edit', settings: 'none' },
}

// ─── 斷言表 ────────────────────────────────────────────────────────────
const cases = [
  // [說明, 實際值, 期望值]

  // 管理員：全部放行
  ['admin canEditStock', canEditStock(admin), true],
  ['admin canAdminInventory', canAdminInventory(admin), true],
  ['admin canViewAllActivity', canViewAllActivity(admin), true],
  ['admin canAccessPage(settings)', canAccessPage(admin, 'settings'), true],

  // 操作員：入庫/修正可以，包材主檔類不行
  ['operator canEditStock', canEditStock(operator), true],
  ['operator canAdminInventory', canAdminInventory(operator), false],
  ['operator canViewAllActivity（activity=view → 只看自己）', canViewAllActivity(operator), false],
  ['operator canAccessPage(inventory)', canAccessPage(operator, 'inventory'), true],
  ['operator canAccessPage(settings)（settings=none）', canAccessPage(operator, 'settings'), false],
  ['operator canUseCalendarOrders', canUseCalendarOrders(operator), true],

  // 檢視者：一律不可編輯，但看得到
  ['viewer canEditStock', canEditStock(viewer), false],
  ['viewer canAdminInventory', canAdminInventory(viewer), false],
  ['viewer canAccessPage(inventory)', canAccessPage(viewer, 'inventory'), true],
  ['viewer canViewPage(inventory)', canViewPage(viewer, 'inventory'), true],
  ['viewer canEditPage(inventory)', canEditPage(viewer, 'inventory'), false],
  ['viewer canUseCalendarOrders（calendar=view）', canUseCalendarOrders(viewer), false],

  // adjustment_only（2026-07-28 新語意）：月曆看得到、訂單唯讀、試吃/耗損/散單可用
  ['sales_only canEditStock', canEditStock(salesOnly), false],
  ['sales_only canAccessPage(inventory)', canAccessPage(salesOnly, 'inventory'), false],
  ['sales_only canUseStockAdjustment', canUseStockAdjustment(salesOnly), true],
  ['sales_only canUseCalendarOrders（adjustment_only 不含訂單 CRUD）', canUseCalendarOrders(salesOnly), false],
  ['sales_only canAccessPage(calendar)', canAccessPage(salesOnly, 'calendar'), true],
  // ↓ 新語意的核心斷言：adjustment_only 現在算「可查看」（原本只回 view/edit → 目前為 false）
  ['sales_only canViewPage(calendar)（新語意：看得到完整月曆）', canViewPage(salesOnly, 'calendar'), true],
  ['sales_only canEditPage(calendar)（仍不可編輯）', canEditPage(salesOnly, 'calendar'), false],

  // 反向確認：view 模式不得誤放行試吃/耗損/散單
  ['viewer canUseStockAdjustment（calendar=view 不得放行）', canUseStockAdjustment(viewer), false],
  ['admin canUseStockAdjustment', canUseStockAdjustment(admin), true],
  ['admin canUseCalendarOrders', canUseCalendarOrders(admin), true],

  // 紀錄頁 edit：看全部
  ['auditor canViewAllActivity（activity=edit）', canViewAllActivity(auditor), true],
  ['auditor canEditStock（inventory=view）', canEditStock(auditor), false],

  // 未登入：全部拒絕
  ['null canEditStock', canEditStock(null), false],
  ['null canAdminInventory', canAdminInventory(null), false],
  ['null canViewAllActivity', canViewAllActivity(null), false],
  ['null canAccessPage(calendar)', canAccessPage(null, 'calendar'), false],
  ['null getPageMode(calendar)', getPageMode(null, 'calendar'), 'none'],

  // 缺值預設：permissions 沒列到的頁面 → none（不是靜默放行）
  [
    '缺值頁面預設 none',
    getPageMode({ id: 'x', username: 'x', is_admin: false, permissions: {} }, 'inventory'),
    'none',
  ],
]

let failed = 0
for (const [label, actual, expected] of cases) {
  if (actual !== expected) {
    console.log(`❌ ${label}: 期望 ${JSON.stringify(expected)}，實際 ${JSON.stringify(actual)}`)
    failed++
  }
}

console.log(`\n📊 ${cases.length - failed}/${cases.length} 通過`)
if (failed > 0) {
  console.log(`\n${failed} 項失敗`)
  process.exit(1)
}
console.log('✅ 權限判斷全部符合預期')
