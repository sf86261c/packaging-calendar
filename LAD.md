# LAD — 包裝行事曆 Web 應用開發紀錄

## 專案概述

將原本 Excel 管理的蛋糕/曲奇/圓筒每日包裝排程系統（2,325 個 SUMIF 公式、128 欄橫向展開），轉換為 Web 應用。

- **GitHub**: https://github.com/sf86261c/packaging-calendar
- **Vercel 部署**: https://packaging-calendar.vercel.app （自動部署）
- **Supabase 專案**: https://zgkvmbaxbksxjckzkths.supabase.co

## 技術棧

| 層級 | 技術 |
|------|------|
| 前端 | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS 4 + shadcn/ui (@base-ui/react) |
| 資料庫 | Supabase (PostgreSQL) + RLS（開放 anon 讀寫） |
| 認證 | 無（公開內部工具，打開即可操作） |
| 部署 | Vercel (Hobby plan, 自動 CI/CD) |
| 圖表 | Recharts 3.8 |
| 即時同步 | Supabase Realtime |

## 功能清單

### 頁面總覽

| 頁面 | 路由 | 狀態 | 說明 |
|------|------|------|------|
| 月曆視圖 | `/calendar` | ✅ 完成 | 月份切換、每日訂單摘要、Realtime、響應式、**日期卡右上角 + 鈕快速新增訂單**（共用 `OrderFormDialog`）、**未來 4 天內含未列印訂單的卡片粉紅警示 + 呼吸燈 badge** |
| 日訂單管理 | `/calendar/[date]` | ✅ 完成 | 新增/編輯/刪除（**編輯時可改訂單日期**）、**付款狀態欄位（列表可一鍵切換 + 編輯 dialog 下拉）**、**分批/追加（複製訂單到多個日期、原訂單品項自動扣減、自動編號 batch_info）**、**資料驅動庫存扣減（product_recipe）**、CSV匯出、Realtime、**今日試吃/耗損/散單 CRUD** |
| 客戶搜尋 | `/search` | ✅ 完成 | 即時搜尋(ilike)、點擊跳轉日期頁 |
| 統計儀表板 | `/dashboard` | ✅ 完成 | 6 統計卡片 + 5 Recharts 圖表（含試吃統計） |
| 庫存總覽 | `/inventory` | ✅ 完成 | **整合產品庫存 + 包材庫存於同頁**：蜂蜜蛋糕（條）/ 旋轉筒包裝 / 曲奇 / 包材；**每項依 own `lead_time_days` 計算 D+N 預計庫存**；安全庫存與到貨時間 inline 可編輯；**曲奇可整批隱藏（隱藏時不列入叫貨通知）**；包材 CRUD/入庫/停用；產品入庫；LINE 叫貨通知；Realtime |
| 設定 | `/settings` | ✅ 完成 | 產品/包裝/烙印 CRUD、**新增產品可同步設定原料配方與包材消耗**、每項產品可📋編輯配方 |

### 產品結構

| 類別 | category | 品項 | 庫存換算 |
|------|----------|------|---------|
| 蜂蜜蛋糕（盒） | `cake` | 經典原味+伯爵紅茶、經典原味+茉莉花茶、伯爵紅茶+茉莉花茶、經典原味、伯爵紅茶、茉莉花茶 | 1盒 = 2條 cake_bar |
| 蛋糕原料（條） | `cake_bar` | 經典原味（條）、伯爵紅茶（條）、茉莉花茶（條） | 庫存追蹤單位 |
| 旋轉筒 | `tube` | 旋轉筒-經典原味、旋轉筒-伯爵紅茶、旋轉筒-茉莉花茶 | 1筒 = 1條 cake_bar |
| 旋轉筒包裝 | `tube_pkg` | 四季童話、銀河探險、馬戲團 | 包裝容器庫存追蹤 |
| 單入蛋糕 | `single_cake` | 單入-經典原味、單入-伯爵紅茶、單入-茉莉花茶 | 1個 = 0.25條 cake_bar |
| 曲奇 | `cookie` | 綜合白、綜合粉、綜合藍、原味白、可可粉、伯爵藍 | 獨立計算 |

**旋轉筒雙維度追蹤**：
- 訂單介面用 `tube`（按口味）：客戶點什麼口味 → 扣減 cake_bar
- 庫存頁面用 `tube_pkg`（按包裝款式）：包裝容器消耗 → 選擇包裝款式時自動扣減

### 包裝/烙印規則

| 類別 | 包裝款式 | 烙印款式 |
|------|---------|---------|
| 蜂蜜蛋糕 | 下拉：祝福緞帶(米)、森林旋律(粉)、歡樂派對(藍) | 下拉：甜蜜樂章、慶祝派對、馬年限定 |
| 旋轉筒 | 下拉：四季童話、銀河探險、馬戲團 | 無 |
| 單入蛋糕 | **每口味各自選擇**：愛心、花園、小熊 | **自由輸入框**（共用 1 個） |
| 曲奇 | 無 | 無 |

- 烙印款式：**僅蜂蜜蛋糕有填數量時才啟用**
- 包裝/烙印欄位：**填了數量後才動態顯示**
- 單入蛋糕：每個有數量的口味各自顯示獨立包裝款式選擇
- 一張訂單可**同時包含多種類別**

### 訂單功能

- **新增/編輯/刪除**：完整 CRUD（筆圖示=編輯、垃圾桶=刪除）；**編輯訂單時可修改訂單日期**（改日期後該筆會從當前日頁面消失，inventory 記錄同步更新到新日期）
- **付款狀態（paid）**：訂單列表「印」與「狀態」之間顯示已付款 / 未付款 pill（一鍵切換）；編輯 dialog 在客戶姓名與備註之間新增「付款」下拉；右側統計卡新增付款狀態小卡；CSV 匯出含付款欄位
- **分批/追加**：編輯訂單 dialog 備註欄左側「分批/追加」按鈕（必須是已存在訂單才 enabled），開啟 `SplitOrderDialog` 後可新增多個分批日期，每個分批指定各品項數量。確認後流程：
  1. 對每個分批日期建立新訂單（複製當前 form 的客戶/狀態/付款/包裝/烙印）
  2. 原訂單品項數量自動扣減（formItems − Σ splits）
  3. 所有相關訂單依日期由小到大重排，覆寫 batch_info = `分批1.` / `分批2.` / ...
  4. inventory 對每筆訂單呼叫 RPC `replaceOrderInventory`（包含原料 + 包材 + tube_pkg）
  5. 關閉所有 dialog、reset form、fetchOrders
- **庫存自動扣減**：
  - cake → 扣 cake_bar（每口味 1 條/盒）
  - tube → 扣 cake_bar（1 條/筒）+ 扣 tube_pkg（選擇的包裝款式）
  - single_cake → 扣 cake_bar（0.25 條/個）
  - 刪除/編輯訂單時自動回沖再重算
- **包材自動扣減**：
  - 根據 `product_material_usage` 對照表，自動計算各包材用量並寫入 `packaging_material_inventory`
  - 匹配規則：精確匹配 `packaging_style_id` + 通用匹配（null），兩者合併計算
  - 支援 cake/tube/single_cake/cookie 所有類別（cake_bar/tube_pkg 原料跳過）
  - 刪除/編輯訂單時自動回沖再重算
  - 缺少對照的組合顯示黃色警示 banner（8 秒自動消失）
  - 新增包材只需在 `/materials` 設定用量對照，無需改程式碼
- **CSV 匯出**：日訂單頁面「匯出」按鈕
- **狀態欄**：自由輸入框
- **列印勾選**：checkbox，勾選後整列背景變黃色

### 試吃/耗損/散單功能（非訂單庫存扣減）

- **類型**：`sample`（試吃）/ `waste`（耗損）/ `retail`（散單）分開記錄，可分別做報表分析
- **散單產品清單**：切為 `retail` 時下拉僅顯示蜂蜜蛋糕(盒)(cake) + 旋轉筒(tube) + 曲奇(cookie) 全部活躍品項
- **扣減模式**：
  - 「扣成品」→ 透過 `product_recipe` 展開為原料扣減 + 透過 `product_material_usage` 展開為包材扣減
  - 「扣原料」→ 直接扣 `cake_bar` / `tube_pkg` 產品庫存
  - 包材耗損暫不支援（未來視需求在 `/materials` 頁面另開入口）
- **資料表**：`stock_adjustments`（父：date, adjustment_type, note）+ `stock_adjustment_items`（子：product_id, quantity, deduct_mode）
- **reference_note 格式**：`adjust:${adjustmentId}`
- 日頁面（`/calendar/[date]`）右上角「🍰 今日試吃/耗損/散單」按鈕開啟 Dialog，列表顯示於訂單卡片下方，支援編輯/刪除

### Realtime 同步

- `/calendar`、`/calendar/[date]`、`/inventory` 已啟用 Supabase Realtime
- 多人同時操作時自動刷新，無需手動重整
- 需在 Supabase Dashboard > Database > Publications 中啟用 `supabase_realtime` publication

### 統計儀表板（Recharts）

| 統計卡片 | 說明 |
|---------|------|
| 本月訂單 | 總訂單筆數 |
| 蛋糕出貨 | cake + single_cake 數量 |
| 旋轉筒出貨 | tube 數量（紫色） |
| 曲奇出貨 | cookie 數量 |
| 未列印 | 尚未列印的訂單數 |

| 圖表 | 類型 | 資料來源 |
|------|------|---------|
| 包裝款式統計 | BarChart（水平長條） | orders → packaging_styles |
| 曲奇銷量分析 | PieChart（圓餅） | order_items → cookie products |
| 每日出貨趨勢 | LineChart（折線，3 線） | 蛋糕(粉紅)/旋轉筒(紫)/曲奇(琥珀) |
| 每日訂單量 | AreaChart（面積） | orders 按日期分組 |

### 庫存總覽（整合 /inventory + /materials）

`/materials` 路由已併入 `/inventory`，AppShell 移除「包材」項目。

- **產品**：cake_bar（經典原味/伯爵紅茶/茉莉花茶）、tube_pkg（四季童話/銀河探險/樂園馬戲）、cookie（綜合白→綜合粉→綜合藍→原味白→可可粉→伯爵藍）
- **每項依 own `lead_time_days`（D+N）計算未來庫存**：
  - 公式：`stock = SUM(inventory WHERE product_id=X AND date <= today + lead_time_days)`
  - 卡片右上角顯示 D+N badge，點擊 inline 編輯
  - 蛋糕條/旋轉筒/曲奇預設 D+15、包材預設 D+7（per-item 可改）
- **曲奇可整批隱藏**：曲奇 section 標題旁眼睛 icon「隱藏 / 顯示」按鈕，按下時 batch update 所有 cookie 的 `show_in_inventory`，**隱藏狀態下叫貨通知 API 不列入**
- **安全庫存**：每張卡片 inline 編輯（pencil icon），存於 `products.safety_stock`
- **包材**：CRUD（名稱、單位、安全庫存、到貨時間）+ 入庫 + 停用 + 已停用區
- **LINE 叫貨通知**：
  - 右上角「叫貨通知」按鈕（手動測試）+ **每日 9:00 AM 自動檢測**（Vercel Cron）
  - 產品檢查：對 cake_bar / tube_pkg / cookie 過濾 `show_in_inventory = true`，每項用 own `lead_time_days` 比對庫存
  - 包材檢查：每包材依 own `lead_time_days` 比對庫存
  - 訊息格式：`• 名稱(D+N)：stock / 安全 N`
- Realtime 即時同步（inventory + packaging_material_inventory）
- 用量對照在 `/settings` 頁面（點產品旁 📋 編輯配方）

### 設定頁面 CRUD

- 產品管理：按 category 分組，支援新增/行內編輯名稱/停用
- 包裝款式管理：新增時可選擇適用類別（蜂蜜蛋糕/旋轉筒/單入蛋糕），按類別分組顯示，支援色碼設定/編輯/停用
- 烙印款式管理：新增時可選擇適用類別，按類別分組顯示，支援編輯/停用
- 訂單表單自動讀取 DB category 欄位過濾包裝/烙印選項（不再硬編碼）

## 資料庫 Schema

### 核心表

```
products         — 產品主檔 (category, name, sort_order, is_active)
                   category CHECK: cake, cake_bar, cookie, tube, single_cake, tube_pkg
packaging_styles — 包裝款式 (name, color_code, category, is_active)
                   category: 適用產品類別 (cake/tube/single_cake)
branding_styles  — 烙印款式 (name, category, is_active)
                   category: 適用產品類別 (cake/tube/single_cake)
orders           — 訂單 (order_date, customer_name, status, batch_info, printed, paid,
                    cake_packaging_id, cake_branding_id,
                    tube_packaging_id,
                    single_cake_packaging_id, single_cake_branding_text)
order_items      — 訂單品項 (order_id, product_id, quantity, packaging_id)
                   packaging_id: 單入蛋糕 per-item 包裝
inventory        — 庫存紀錄 (product_id, date, type, quantity, reference_note)
product_recipe    — 原料配方 BOM (product_id, ingredient_id, quantity_per_unit)
                   ingredient_id 指向 cake_bar 或 tube_pkg 類別的 product
                   注意：cake_bar 名稱含「（條）」後綴，比對時需 REPLACE 剝除
stock_adjustments — 試吃/耗損/散單 (date, adjustment_type, note)
                   adjustment_type: sample / waste / retail
stock_adjustment_items — 扣減項目 (adjustment_id, product_id, quantity, deduct_mode, packaging_style_id)
                   deduct_mode: finished (透過 recipe 展開) / ingredient (直接扣)
                   packaging_style_id: 成品扣減時指定包裝款式（用於包材對照）
```

### 包材相關表

```
packaging_materials          — 包材主檔 (name, unit, safety_stock, is_active)
packaging_material_inventory — 包材庫存紀錄 (material_id, type, quantity, reference_note)
product_material_usage       — 產品→包材用量對照 (product_id, packaging_style_id, material_id, quantity_per_unit)
```

### 庫存扣減機制

- **資料驅動**：訂單 / 試吃 / 耗損的「扣成品」模式透過 `product_recipe` 展開為原料扣減、透過 `product_material_usage` 展開為包材扣減
- 共用 helper 在 `src/lib/stock.ts`：`calculateIngredientDeductions`、`calculateMaterialDeductions`、`applyIngredientDeductions`、`applyMaterialDeductions`、`reverseIngredientDeductions`、`reverseMaterialDeductions`、`deductDirectIngredient`
- 訂單建立時：依 order_items 對每個產品查 recipe → insert `inventory` 記錄（type='outbound', quantity=負數）
- `reference_note` 格式：
  - 訂單：`order:${orderId}`
  - 試吃/耗損：`adjust:${adjustmentId}`
- `date` 欄位：訂單為 `order_date`；試吃/耗損為該筆 adjustment 的 `date`
- 刪除/編輯時：先刪除對應 reference_note 的記錄，再重新計算
- **tube_pkg 扣減例外**：保留硬編碼「按訂單 `tube_packaging_id` 對應包裝款式名稱、扣同名 tube_pkg 產品」邏輯（per-packaging 屬性不進 recipe）

### RLS 政策

- 所有表啟用 Row Level Security
- 政策改為 `TO anon, authenticated`（`FOR ALL USING (true) WITH CHECK (true)`）
- 由於前端移除登入，anon 角色需可讀寫所有資料（團隊內部工具，不對外開放）

### Migrations

| 檔案 | 內容 |
|------|------|
| `001_initial_schema.sql` | 建表、索引、seed data、RLS、trigger |
| `002_update_products.sql` | 新產品結構、新烙印/包裝、printed 欄位 |
| `003_per_category_packaging.sql` | 每類別獨立 packaging/branding 欄位 |
| `004_tube_rename_cookie_order.sql` | tube_pkg 產品、曲奇排序、order_items.packaging_id、product_material_usage.packaging_style_id |
| `005_packaging_branding_category.sql` | packaging_styles/branding_styles 加 category 欄位、seed 現有資料對應 |
| `006_single_flavor_cake.sql` | 蜂蜜蛋糕(盒) 新增單口味品項：經典原味、伯爵紅茶、茉莉花茶 |
| `007_fix_settings_rls.sql` | 修復 products/packaging_styles/branding_styles 缺少 INSERT/UPDATE/DELETE RLS 政策 |
| `008_inventory_date_backfill.sql` | 回填 inventory/packaging_material_inventory 的 date 欄位為對應訂單的 order_date |
| `009_material_lead_time.sql` | packaging_materials 新增 lead_time_days 欄位（預設 7 天） |
| `010_product_recipe.sql` | 新增 product_recipe 表、seed 15 筆既有產品配方（6 cake + 3 tube + 3 single_cake，處理「（條）」後綴匹配） |
| `011_stock_adjustments.sql` | 新增 stock_adjustments + stock_adjustment_items 父子表 + RLS + CHECK constraints |
| `012_stock_adjustment_packaging.sql` | stock_adjustment_items 新增 packaging_style_id（試吃/耗損成品扣包材用） |
| `013_stock_adjustment_retail.sql` | 擴充 adjustment_type 支援 retail（散單） |
| `014_open_public_access.sql` | 移除登入後開放 anon 角色讀寫（所有資料表） |
| `015_fix_tube_pkg_data.sql` | 啟用 3 個 tube_pkg 產品，將「馬戲團」改名為「樂園馬戲」對齊 packaging_styles |
| `016_inventory_rpc.sql` | 新增 4 個 RPC functions（atomic transaction）：replace/delete order/adjustment inventory |
| `017_product_safety_stock.sql` | products 加 safety_stock 欄位（per-product 可編輯安全庫存）+ backfill 對齊原 hard-coded 值 |
| `018_order_paid.sql` | orders 加 paid BOOLEAN 欄位（付款狀態，預設 FALSE） |
| `019_product_lead_time_visibility.sql` | products 加 lead_time_days INT DEFAULT 15 + show_in_inventory BOOLEAN DEFAULT TRUE |
| `020_orders_batch_group_id.sql` | orders 加 batch_group_id UUID（取代「同名 + batch_info」隱式匹配） |
| `021_orders_notes.sql` | orders 加 notes TEXT（保留 batch_info 中的非數字備註） |
| `022_product_is_common.sql` | products 加 is_common BOOLEAN DEFAULT TRUE + 補入 6 個曲奇特殊組合（原味粉/原味藍/伯爵白/伯爵粉/可可白/可可藍）並標記為非常用 |
| `023_copy_special_cookie_materials.sql` | 從原味白/伯爵藍/可可粉 的 product_material_usage 複製包材配方給對應的 6 個特殊組合 |

## 檔案結構

```
packaging-calendar/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # 根 layout + AppShell
│   │   ├── page.tsx                # 重導到 /calendar
│   │   ├── calendar/
│   │   │   ├── page.tsx            # 月曆視圖 (Realtime)
│   │   │   └── [date]/page.tsx     # 日訂單管理 (CRUD+庫存+匯出+Realtime+試吃/耗損/散單)
│   │   ├── search/page.tsx         # 客戶搜尋
│   │   ├── dashboard/page.tsx      # 統計儀表板 (Recharts, 5卡片+4圖表)
│   │   ├── inventory/page.tsx      # 庫存總覽（產品+包材，per-item D+N，曲奇可隱藏）
│   │   ├── settings/page.tsx       # 設定 (CRUD)
│   │   └── api/
│   │       └── line-notify/route.ts # LINE 叫貨通知 API
│   ├── components/
│   │   ├── app-shell.tsx           # 側邊導航 + 頂部欄（無登出按鈕）
│   │   ├── stock-adjustment-dialog.tsx # 試吃/耗損/散單 Dialog
│   │   └── ui/                     # shadcn/ui 元件 (20+, 基於 @base-ui/react)
│   ├── lib/
│   │   ├── stock.ts                # 庫存扣減共用 helper
│   │   ├── supabase.ts             # 瀏覽器端 Supabase client
│   │   ├── supabase-server.ts      # 伺服器端 Supabase client（保留供未來用）
│   │   ├── types.ts                # TypeScript 型別定義
│   │   └── utils.ts                # 工具函數
│   └── （已移除 middleware.ts 與 proxy.ts — 無登入檢查）
├── supabase/migrations/            # DB migration SQL (14 檔)
├── .env.local                      # Supabase URL + Key + LINE Token（不進 git）
└── package.json
```

## Git 提交歷史（最近）

```
38cae6e feat: 新增散單類型並移除登入功能
650e4d0 fix(db): migration 012 加 IF NOT EXISTS 以支援重複執行
9e3d945 feat(adjust): 試吃/耗損成品過濾為試吃品+曲奇；cake/tube 支援選包裝扣對應包材
c5fca47 docs: 更新 LAD.md — /materials 移除用量對照說明
ae14f88 refactor(materials): 移除用量對照功能（已由設定頁面取代）
1c77fe4 refactor: 抽出 showMaterialWarnings helper，加註解釐清匹配邏輯
0f5ec8d feat: 訂單建立/編輯/刪除時自動扣減包材庫存
1cc69b2 feat: 包裝/烙印款式新增適用類別關聯，移除硬編碼
399192d feat: 用量對照改為階層式選擇 — 類別→口味→包裝→多種包材
0bde37f feat: 包材庫存支援編輯和刪除功能
a8676a7 feat: 統計儀表板新增旋轉筒出貨統計卡片與折線圖
9328243 feat: 旋轉筒庫存改為追蹤包裝款式，訂單保留口味名稱
082a870 feat: 包裝行事曆 Web 應用初始版本
```

## 待執行的 SQL Migration

Migration 004 & 005 包含 DB schema 變更，需在 Supabase Dashboard > SQL Editor 執行：

```sql
-- 1. 擴充 category check constraint
ALTER TABLE products DROP CONSTRAINT products_category_check;
ALTER TABLE products ADD CONSTRAINT products_category_check
  CHECK (category IN ('cake', 'cake_bar', 'cookie', 'tube', 'single_cake', 'tube_pkg'));

-- 2. 新增旋轉筒包裝庫存產品
INSERT INTO products (category, name, sort_order, is_active) VALUES
  ('tube_pkg', '四季童話', 40, true),
  ('tube_pkg', '銀河探險', 41, true),
  ('tube_pkg', '馬戲團', 42, true);

-- 3. 包裝款式改名
UPDATE packaging_styles SET name = '馬戲團' WHERE name = '旋轉木馬';

-- 4. 曲奇排序
UPDATE products SET sort_order = 50 WHERE name LIKE '綜合白%' AND category = 'cookie';
UPDATE products SET sort_order = 51 WHERE name LIKE '綜合粉%' AND category = 'cookie';
UPDATE products SET sort_order = 52 WHERE name LIKE '綜合藍%' AND category = 'cookie';
UPDATE products SET sort_order = 53 WHERE name LIKE '原味白%' AND category = 'cookie';
UPDATE products SET sort_order = 54 WHERE name LIKE '可可粉%' AND category = 'cookie';
UPDATE products SET sort_order = 55 WHERE name LIKE '伯爵藍%' AND category = 'cookie';

-- 5. 單入蛋糕 per-item 包裝
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS packaging_id UUID REFERENCES packaging_styles(id);

-- 6. 旋轉筒名稱恢復口味（若已被改過）
UPDATE products SET name = '旋轉筒-經典原味' WHERE name = '旋轉筒-四季童話' AND category = 'tube';
UPDATE products SET name = '旋轉筒-伯爵紅茶' WHERE name = '旋轉筒-銀河探險' AND category = 'tube';
UPDATE products SET name = '旋轉筒-茉莉花茶' WHERE name = '旋轉筒-馬戲團' AND category = 'tube';

-- 7. 用量對照含包裝款式維度
ALTER TABLE product_material_usage ADD COLUMN IF NOT EXISTS packaging_style_id UUID REFERENCES packaging_styles(id);

-- === Migration 005: 包裝/烙印款式加入適用類別 ===

-- 8. packaging_styles/branding_styles 加 category 欄位
ALTER TABLE packaging_styles ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE branding_styles ADD COLUMN IF NOT EXISTS category TEXT;

-- 9. Seed 現有資料的類別對應
UPDATE packaging_styles SET category = 'cake' WHERE name IN ('祝福緞帶(米)', '森林旋律(粉)', '歡樂派對(藍)');
UPDATE packaging_styles SET category = 'tube' WHERE name IN ('四季童話', '銀河探險', '馬戲團');
UPDATE packaging_styles SET category = 'single_cake' WHERE name IN ('愛心', '花園', '小熊');
UPDATE branding_styles SET category = 'cake' WHERE category IS NULL;

-- === Migration 006: 蜂蜜蛋糕(盒) 新增單口味品項 ===

-- 10. 新增單口味蛋糕（1盒 = 2條同口味 cake_bar）
INSERT INTO products (category, name, sort_order, is_active) VALUES
  ('cake', '經典原味', 13, true),
  ('cake', '伯爵紅茶', 14, true),
  ('cake', '茉莉花茶', 15, true);

-- === Migration 007: 修復設定頁面 RLS 政策 ===

-- 11. products/packaging_styles/branding_styles 補上 INSERT/UPDATE/DELETE 政策
CREATE POLICY "Authenticated users can insert products"
  ON products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update products"
  ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete products"
  ON products FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert packaging_styles"
  ON packaging_styles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update packaging_styles"
  ON packaging_styles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete packaging_styles"
  ON packaging_styles FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert branding_styles"
  ON branding_styles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update branding_styles"
  ON branding_styles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete branding_styles"
  ON branding_styles FOR DELETE TO authenticated USING (true);

-- === Migration 008: 回填庫存記錄日期 ===

-- 12. 將 inventory 中由訂單產生的記錄，date 更正為對應訂單的 order_date
UPDATE inventory i
SET date = o.order_date
FROM orders o
WHERE i.reference_note = 'order:' || o.id::text
  AND i.type = 'outbound';

-- 13. 將 packaging_material_inventory 中由訂單產生的記錄，date 更正為對應訂單的 order_date
UPDATE packaging_material_inventory pmi
SET date = o.order_date
FROM orders o
WHERE pmi.reference_note = 'order:' || o.id::text
  AND pmi.type = 'outbound';

-- === Migration 009: 包材到貨時間 ===

-- 14. packaging_materials 新增到貨時間欄位
ALTER TABLE packaging_materials
  ADD COLUMN IF NOT EXISTS lead_time_days INT NOT NULL DEFAULT 7;

-- === Migration 010: product_recipe ===
-- (完整 SQL 見 supabase/migrations/010_product_recipe.sql)
-- 要點：建 product_recipe 表 + RLS + seed 15 筆既有配方
--       注意 cake_bar 名稱含「（條）」後綴，seed SQL 用 REPLACE 剝除比對

-- === Migration 011: stock_adjustments ===
-- (完整 SQL 見 supabase/migrations/011_stock_adjustments.sql)
-- 要點：建 stock_adjustments 父子表 + RLS + CHECK constraints

-- === Migration 012: stock_adjustment_items 加 packaging_style_id ===
ALTER TABLE stock_adjustment_items
  ADD COLUMN IF NOT EXISTS packaging_style_id UUID REFERENCES packaging_styles(id);

-- === Migration 013: adjustment_type 擴充散單(retail) ===
ALTER TABLE stock_adjustments
  DROP CONSTRAINT IF EXISTS stock_adjustments_adjustment_type_check;
ALTER TABLE stock_adjustments
  ADD CONSTRAINT stock_adjustments_adjustment_type_check
  CHECK (adjustment_type IN ('sample', 'waste', 'retail'));

-- === Migration 014: 移除登入，開放 anon 角色 ===
-- (完整 SQL 見 supabase/migrations/014_open_public_access.sql)
-- 要點：DO $$ 迴圈 drop 所有 table 的現有 policy，
--       改為 FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)
```

## 變更紀錄

### 2026-04-28 — 曲奇特殊組合包材配方複製

**需求**：6 個曲奇特殊組合（原味粉/原味藍/伯爵白/伯爵粉/可可白/可可藍）剛被補入，沒有任何 `product_material_usage` 配方，下單時包材不會被扣減。需參考既有 3 個曲奇配方批次套用。

**對應規則（同口味共用配方）**

| 來源（既有有配方） | 目標（新組合套用相同配方） |
|---|---|
| 原味白 | 原味粉、原味藍 |
| 伯爵藍 | 伯爵白、伯爵粉 |
| 可可粉 | 可可白、可可藍 |

**設計**
- Migration 023：用 `INSERT … SELECT` 動態抓取來源產品的所有 `product_material_usage` 紀錄（material_id / packaging_style_id / quantity_per_unit）複製到目標產品
- `NOT EXISTS` 守門：若目標產品已有任何配方則整批跳過 → 重複執行安全、不會覆蓋使用者手動修改的配方
- 不需要 `product_recipe`（曲奇本就「獨立計算」，不依賴 cake_bar 原料）

**變更檔案**

| 變更 | 檔案 |
|---|---|
| Migration 023 | `supabase/migrations/023_copy_special_cookie_materials.sql` |

**Migration（待 Dashboard 執行）**
- 必須先執行 022（補入新產品）再執行 023（複製配方）

### 2026-04-28 — 曲奇特殊組合預設折疊（is_common）

**需求**：曲奇 6 個特殊組合（原味粉/原味藍/伯爵白/伯爵粉/可可白/可可藍）不常被訂購，不希望每次都在訂單下拉中出現。

**設計**
- Migration 022：products 加 `is_common BOOLEAN DEFAULT TRUE`，並補入 6 個特殊組合且標記 `is_common = FALSE`
- 訂單 dialog（`OrderFormDialog` + `[date]/page.tsx` 內建 dialog）：
  - 衍生 `commonCookieProducts` / `specialCookieProducts` / `hasSpecialCookieInForm`
  - 預設只列 `is_common = true` 的曲奇
  - 加切換按鈕「+ 顯示其他組合（N）」/「− 收合特殊組合（N）」
  - 編輯訂單若已包含特殊組合（formItems 中 quantity > 0），自動展開（覆寫 toggle）
  - 特殊組合品名以 `text-gray-500` 弱化，視覺區分
- 設定頁面（`/settings`）：曲奇類別產品 badge 旁加「常用/特殊」toggle（其他類別不顯示），呼叫 `toggleProductCommon` 寫 DB

**取捨**：保留 `is_common` 欄位給所有產品（不限 cookie），未來其他類別若有同樣需求可直接套用；目前只在 cookie 類別曝露 UI。

**變更檔案**

| 變更 | 檔案 |
|---|---|
| Migration 022 | `supabase/migrations/022_product_is_common.sql` |
| `Product` interface 加 `is_common: boolean` | `src/lib/types.ts` |
| `OrderFormDialog` 曲奇折疊邏輯 | `src/components/order-form-dialog.tsx` |
| `[date]/page.tsx` 內建 dialog 同步處理 | `src/app/calendar/[date]/page.tsx` |
| 設定頁 cookie 加常用/特殊 toggle + `toggleProductCommon` handler | `src/app/settings/page.tsx` |

**Migration（待 Dashboard 執行）**
- `022_product_is_common.sql` — 未執行前 `is_common` 不存在，所有切換 UI 失效；6 個特殊組合不會被補入

### 2026-04-27 — UI 動畫：日期卡 + 鈕 hover 水波 + 全 Dialog macOS Genie 動畫

**需求**：日期卡 + 鈕平時隱藏，滑鼠懸停才以水波方式顯現；所有產生額外視窗的 dialog（新增、編輯、分批、試吃/耗損/散單…）點開時要像 macOS Dock 反向 Genie 一樣從觸發點精靈式釋放出來，關閉時收回。

**設計**

1. **日期卡 + 鈕水波 hover**
   - 預設 `opacity-0 scale-50`，`group-hover:opacity-100 group-hover:scale-100`（300ms ease-out）
   - 疊兩層 `animate-ping`：內層黑色 disc（opacity 40%）+ 外層 ring（`[animation-delay:300ms]` 錯開時序）
   - `focus-visible:` 維持鍵盤可達性

2. **Dialog Genie 動畫（全域）**
   - 在 `globals.css` 定義 `@keyframes dialog-genie-in / dialog-genie-out`，0%/100% 在 origin 點以 `scale(0.05)` emerge，30% 中段 `scale(0.2, 0.55)` 製造漏斗（scaleY 為 scaleX 的 2.75x），65% 接近原尺寸，100% 居中 `scale(1)`
   - `@property --genie-tx / --genie-ty` 註冊為 `<length>` + `inherits: true`，讓 CSS 變數可在 keyframes 之間插值，並透過 inheritance 傳到 portal 中的 popup
   - 直接寫 raw CSS rule `[data-slot="dialog-content"][data-open]` / `[data-closed]`，避開 Tailwind arbitrary value parser
   - `dialog.tsx` module-level 全域 listener 監聽 `pointerdown` + `keydown(Enter/Space)`，把觸發點相對 viewport 中心的偏移寫到 `document.documentElement.style.setProperty('--genie-tx/ty', …)`
   - cubic-bezier in: `(0.16, 1, 0.3, 1)` ease-out-expo / out: `(0.7, 0, 0.84, 0)` ease-in
   - 支援 `prefers-reduced-motion: reduce`

**踩到兩個非預期 bug（已修，留紀錄避免再踩）**

1. **Tailwind 4 把 `-translate-x-1/2 -translate-y-1/2` 編譯成 CSS 個別屬性 `translate: -50% -50%`，不是 `transform`**。CSS 規範下 `translate` 屬性先 apply、再 apply `transform`，所以 keyframes 寫 `transform: translate(-50%, -50%) ...` 會跟 className 的 translate **疊兩次**，dialog 跑到 viewport -100%/-100% 位置（即左上角、上半截跑出 viewport）。
   - **修法**：keyframes 不寫 `translate(-50%, -50%)`，居中交由 className 的 `translate` 屬性處理，keyframes 只負責 genie offset + scale。

2. **base-ui Popup 會接管 popup 的 inline style**（自動寫入 `--nested-dialogs: 0;` 等），用 `useLayoutEffect` + `popupRef.current.style.setProperty('--genie-tx', ...)` 設的 CSS variable 會被它覆寫。
   - **修法**：把 `--genie-tx/-ty` 設在 `<html>` 上，`@property inherits: true` 讓 popup 透過 CSS inheritance 自動取用，繞過 base-ui 對 popup inline style 的接管。

**變更檔案**

| 變更 | 檔案 |
|---|---|
| 加 `dialog-genie-in/out` keyframes + raw CSS rule + `@property --genie-tx/ty` | `src/app/globals.css` |
| 全域 pointerdown/keydown listener 設 `<html>` 的 `--genie-tx/ty`、清掉 popup ref 與 inline style 寫入 | `src/components/ui/dialog.tsx` |
| 月曆日期卡 + 鈕改為 `opacity-0 scale-50` 預設隱藏 + group-hover 顯現 + `animate-ping` 雙層水波 | `src/app/calendar/page.tsx` |

---

### 2026-04-27 — 庫存頁整合 + per-item lead_time + 曲奇可隱藏

**需求**：合併庫存與包材頁；曲奇可隱藏（連帶不通知）；蛋糕 D+15 改為 per-item 可編輯。

**設計**
- Migration 019：products 加 `lead_time_days INT DEFAULT 15` + `show_in_inventory BOOLEAN DEFAULT TRUE`
- 改寫 `/inventory` 為「庫存總覽」：包含蛋糕條 / 旋轉筒包裝 / 曲奇 / 包材四個 section
- **每項依 own `lead_time_days`** 計算「today + N 天為止的累積庫存」
- 卡片右上角 D+N badge 點擊 inline 編輯（pencil 編輯安全庫存維持原狀）
- 曲奇 section 標題旁眼睛 icon「隱藏 / 顯示」，按下 batch update 所有 cookie 的 `show_in_inventory`
- API `/api/line-notify`：products query 加 `.eq('show_in_inventory', true)`、加上 cookie 類別、每項用 own `lead_time_days` 計算（與包材邏輯一致）；訊息加 D+N
- 移除 `/materials` 路由（檔案刪除）+ AppShell 移除「包材」項目

**變更檔案**

| 變更 | 檔案 |
|---|---|
| Migration 019 | `supabase/migrations/019_product_lead_time_visibility.sql` |
| 庫存頁整合改寫 | `src/app/inventory/page.tsx` |
| 移除包材路由 | `src/app/materials/page.tsx`（刪除） |
| 側欄移除「包材」 | `src/components/app-shell.tsx` |
| 叫貨 API per-item lead + show_in_inventory 過濾 | `src/app/api/line-notify/route.ts` |

**Migration**
- `019_product_lead_time_visibility.sql` — 已於 2026-04-28 執行

### 2026-04-27 — 分批/追加複製訂單

**需求**：編輯訂單時要能把品項拆分到別的日期；自動編號 batch_info。

**設計**
- 新元件 `SplitOrderDialog`（`src/components/split-order-dialog.tsx`）
  - 以「當前 form 的 formItems」作為可分配的池
  - 可動態 +/- 多個分批 row，每 row 一個日期 + 各品項數量
  - 即時顯示「原 / 已分 / 剩餘」與紅色超量警示
  - 驗證：至少 1 筆有日期且有品項；單品項 Σ ≤ 池量
- 編輯 dialog 備註欄改為 flex：[分批/追加 按鈕] + [備註 input]，按鈕在新增模式下 disabled（必須先儲存）
- `handleSplitConfirm`：
  1. 建立各分批新訂單（複製 form 全部非品項欄位）
  2. update 原訂單（同步當前 form 改動 + newPool 為 quantity）
  3. 所有相關訂單依 date 排序，依序 update batch_info = `分批{i+1}.`
  4. 每筆呼叫 `replaceOrderInventory` 重算原料/包材/tube_pkg
  5. 關閉 dialogs、resetForm、fetchOrders

**變更檔案**

| 變更 | 檔案 |
|---|---|
| 新元件 SplitOrderDialog | `src/components/split-order-dialog.tsx` |
| 備註欄加按鈕 + state + handleSplitConfirm + 掛載 dialog | `src/app/calendar/[date]/page.tsx` |

### 2026-04-27 — 訂單編輯日期可改 + 付款狀態欄位

**需求**：日期卡編輯訂單時希望能改日期；訂單需追蹤付款狀態。

**變更**

| 變更 | 檔案 |
|---|---|
| Migration 018：`orders.paid BOOLEAN NOT NULL DEFAULT FALSE` | `supabase/migrations/018_order_paid.sql` |
| `Order` interface 加 `paid: boolean` | `src/lib/types.ts` |
| `OrderFormDialog`（共用元件）：`EditingOrder` 加 paid、加 `formPaid` state、UI 在客戶姓名與備註之間插入「付款」下拉、handleSave 寫 paid | `src/components/order-form-dialog.tsx` |
| `[date]/page.tsx` 內建 dialog：新增 `formDate` state（編輯時可改日期）、Dialog 第一排第一格加日期欄、付款下拉與狀態同列、handleSaveOrder 改用 formDate 寫 orders.order_date 與 inventory.date、`handlePaidToggle` 一鍵切換、訂單列表「印」與「狀態」之間加付款 pill、新增付款狀態統計小卡、CSV 匯出加付款欄、SELECT/mapping 加 paid | `src/app/calendar/[date]/page.tsx` |
| `search/page.tsx`：SearchResult 加 paid、SELECT 加 paid、結果卡顯示已付款/未付款、openEdit 傳 paid 給 EditingOrder | `src/app/search/page.tsx` |

**Migration**
- `018_order_paid.sql` — 已於 2026-04-28 執行

### 2026-04-22 — 庫存扣減原子化 + 警示強化

**對策（基於 code review 與 e2e 測試發現）**

| 問題 | 對策 |
|---|---|
| reverse + apply 兩段獨立 await，中途斷線可能導致 inventory 永久遺失 | Migration 016 新增 4 個 plpgsql RPC，把 DELETE old + INSERT new 包成單一 transaction |
| Supabase 寫入 error 全部不檢查，失敗無感 | OrderFormDialog / [date] 全部加 `try/catch` + 失敗 alert |
| 月曆快速新增 dialog 缺 onWarning，包材警示被吞 | calendar/page.tsx 加 amber banner + 連接 onWarning callback |
| 散單/試吃/耗損 finished mode 漏了 tube_pkg 扣減 | handleSaveAdjustment 補上 tube_pkg name-match 邏輯，與訂單路徑對齊 |
| tube_pkg name-match 失敗（產品停用 / 名稱漂移）靜默無感 | 新增 missingTubePkg 警示，併入 amber banner 顯示 |
| tube_pkg 三個產品全部 is_active=false，「馬戲團」與新名稱「樂園馬戲」不一致 | Migration 015 啟用 product + 改名對齊 |

**Migrations（待 Dashboard 執行）**
- `015_fix_tube_pkg_data.sql` — UPDATE products 修正 tube_pkg
- `016_inventory_rpc.sql` — CREATE 4 個 RPC + GRANT EXECUTE TO anon

**關聯檔案**
- `src/lib/stock.ts`：新增 `replaceOrderInventory` / `deleteOrderWithInventory` / `replaceAdjustmentInventory` / `deleteAdjustmentWithInventory` RPC wrappers
- `src/components/order-form-dialog.tsx`：handleSave 改用 RPC + try/catch + tube_pkg warning
- `src/app/calendar/[date]/page.tsx`：handleSaveOrder / handleDelete / handleSaveAdjustment / handleDeleteAdjustment 全部改用 RPC + try/catch + finished mode 補 tube_pkg

### 2026-04-22 — 月曆 UX 強化

**快速新增訂單**
- 月曆每日卡片右上角新增 + 按鈕，點擊即開啟訂單 Dialog（不需先進入日頁面）
- 重用既有 `OrderFormDialog` 元件（`src/components/order-form-dialog.tsx`），無重複邏輯
- 樣式：28px 黑底白十字圓鈕，hover 變灰
- 按鈕內 `e.stopPropagation()`，不會觸發整張卡的「跳轉日頁面」行為
- 儲存後自動 `fetchData()` 刷新月曆 summary

**迫近未列印警示**
- 條件：`differenceInCalendarDays(day, today) ∈ [0,4]` 且該日 `pending > 0`
- 卡片背景改粉紅 (`bg-pink-100 border-pink-400`)，日期數字改 `text-pink-700`
- 「未列印 N」badge 樣式升級為粉紅高亮 + Tailwind `animate-pulse` 呼吸燈
- 大於 4 天的未列印 badge 維持原本橘色靜態樣式

### 2026-04-20 — 散單類型 + 移除登入

- **新增散單類型**：`stock_adjustments.adjustment_type` 加入 `retail`（散單）
  - Dialog 新增第三顆 radio「散單」，切換時 items 重置
  - 散單時下拉僅顯示全部活躍 cake + tube + cookie（排除 cake_bar/tube_pkg/single_cake 及試吃品）
  - 試吃/耗損仍維持原過濾（cake/tube 僅含「試吃」名稱 + cookie）
  - 日頁面按鈕「🍰 今日試吃/耗損」→「🍰 今日試吃/耗損/散單」
  - 卡片標題與 badge 顯示新增散單分支
- **移除登入**：刪除 `src/proxy.ts`、`src/app/login/`；AppShell 移除登出按鈕
  - RLS 改為 `TO anon, authenticated`（migration 014）
  - Supabase anon key 本就 public，RLS `USING (true)` 搭配內部使用
- **Migrations**
  - 013 — `adjustment_type` CHECK 擴充 `retail`
  - 014 — DO $$ 迴圈開放 12 張表的 policy 給 anon + authenticated

## 效能優化紀錄（2026-04-15）

### 切頁過慢問題排查

症狀：點選側邊導航切換頁面體感延遲 600-1000ms。

根因：
1. `middleware.ts` 每次導航都呼叫 `supabase.auth.getUser()`（往返 Supabase Auth API 約 200ms）
2. 所有頁面皆為 `'use client'` + `useEffect` 抓資料，切頁後先 render 空殼才開始 fetch
3. Realtime subscription 依賴參數（月份/日期）變動時重建 channel，浪費 WS 握手
4. `calendar/[date]` 每次日期切換都重抓 products/packaging_styles/branding_styles/product_material_usage 等不常變的參考資料
5. Supabase browser client 每次 render 都 call `createClient()`
6. 沒有 `loading.tsx`，導航時有短暫白屏

### 已套用的修正

| 修正 | 檔案 | 效果 |
|------|------|------|
| Middleware 改為輕量 cookie 檢查（已於 2026-04-20 整個刪除） | ~~`src/middleware.ts`~~ / ~~`src/proxy.ts`~~ | 省下每次切頁 ~200ms Supabase Auth 往返；後續再移除整個檔案 |
| Browser client module-level singleton | `src/lib/supabase.ts` | 避免重複建立 GoTrueClient、減少記憶體 |
| 全域 `loading.tsx` 骨架屏 | `src/app/loading.tsx` | 切頁時立即顯示 spinner，消除白屏 |
| 拆分 Realtime 與 data fetch useEffect | `calendar/page.tsx`、`inventory/page.tsx` | Channel 只在 mount 時建一次，依賴變動不再重建 |
| 拆分 static data 只抓一次 | `calendar/[date]/page.tsx` | products/packaging/branding/usages 只在 mount 時抓，不隨日期重抓 |
| Date filter-bound realtime | `calendar/[date]/page.tsx` | Channel 隨 dateStr 重建但 ref 永遠指向最新 fetchOrders |
| `next.config.ts` 加優化 | `next.config.ts` | `optimizePackageImports` 涵蓋 @base-ui/react、recharts、lucide-react、date-fns；關 poweredByHeader；啟 compress |

### 預期效果

- 切頁視覺回饋：白屏 → 即時 spinner
- 後端延遲：每次切頁省下 200ms Auth 往返
- Realtime 握手：只在 mount 建立一次
- Bundle 大小：recharts / @base-ui 等套件按需載入

### 取捨說明

原本的 middleware 驗證從「呼叫 Supabase `getUser()` 驗證 JWT」改為「cookie 存在即放行」，
**於 2026-04-20 整個 middleware / proxy 檔案刪除、登入頁移除**：

- 安全性由 Supabase RLS 在 DB 層把關（anon 全權限讀寫）
- 適用內部工具情境；若未來轉對外服務，須恢復 `createServerClient().auth.getUser()` 並收斂 RLS
- `src/lib/supabase-server.ts` 保留但暫未被引用（api/line-notify 用 service role key 直連）

## 已知限制

1. **公開存取** — 已移除登入，RLS 對 anon 全開；請確保此網站僅供內部團隊使用（不對外分享）
2. **base-ui Select 顯示** — `@base-ui/react` 的 SelectValue 不會自動顯示 ItemText，需在 children 中手動解析 UUID → 名稱
3. **Realtime 需手動啟用** — 需在 Supabase Dashboard > Database > Publications 中將相關表加入 `supabase_realtime` publication

## 未完成事項

### 高優先 ⚠️

1. **執行 Migration 022 + 023**（需依序）：
   - `022_product_is_common.sql`：products 加 `is_common`、補入 6 個特殊組合
   - `023_copy_special_cookie_materials.sql`：從原味白/伯爵藍/可可粉 複製包材配方到對應 6 個新組合（023 必須在 022 之後執行，否則新產品還不存在，配方複製會 0 rows）

### 低優先

1. **自訂域名** — 可在 Vercel Dashboard > Domains 設定
2. **匯出格式擴充** — 目前僅支援 CSV，可考慮加入 PDF 列印排版

### 已完成

- ✅ Migration 013/014 已於 Supabase Dashboard 執行（2026-04-22）
- ✅ Realtime publication 已啟用 5 張表（2026-04-22 端對端測試驗證）
- ✅ 散單/試吃/耗損 finished mode 補 tube_pkg 扣減（2026-04-22 程式碼修復，待 015 啟用 product 後生效）
- ✅ Migration 015 + 016 + 017 已執行（2026-04-27 用戶回報完成）
- ✅ Migration 018 + 019 已執行（2026-04-28 用戶回報完成 — 付款狀態欄位、per-product lead_time/可見性 全面啟用）

## 環境資訊

- **Supabase URL**: `https://zgkvmbaxbksxjckzkths.supabase.co`
- **Supabase Anon Key**: `sb_publishable_w_wFOJOqx1JzcfMgJYo1uw_3X6LcjLZ`
- **Vercel Team**: sf86261cs-projects
- **GitHub User**: sf86261c
- **Node.js**: v24.14.0
- **Next.js**: 16.2.2
- **SUPABASE_SERVICE_ROLE_KEY**: Supabase Service Role Key（`.env.local`，用於 API route 伺服器端查詢）
- **LINE_CHANNEL_ACCESS_TOKEN**: LINE Bot Channel Access Token（`.env.local`）
- **LINE_TARGET_ID**: LINE 推播目標的 User ID 或 Group ID（`.env.local`）

## 部署流程

1. 修改程式碼
2. `git add && git commit -m "..." && git push`
3. Vercel 自動偵測 push → 建置 → 部署（1-2 分鐘）
4. 若有 DB schema 變更，需手動到 Supabase Dashboard > SQL Editor 執行 migration SQL

## Realtime 啟用步驟

在 Supabase Dashboard 中：
1. 前往 Database > Publications
2. 點選 `supabase_realtime` publication
3. 將 `orders`、`order_items`、`inventory`、`stock_adjustments`、`stock_adjustment_items` 加入
4. 或直接在 SQL Editor 執行：
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE stock_adjustments;
ALTER PUBLICATION supabase_realtime ADD TABLE stock_adjustment_items;
```
