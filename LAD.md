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
| 認證 | 自建帳密（pgcrypto bcrypt + RPC SECURITY DEFINER + localStorage session 10h 自動到期） |
| 部署 | Vercel (Hobby plan, 自動 CI/CD) |
| 圖表 | Recharts 3.8 |
| 即時同步 | Supabase Realtime |

## 功能清單

### 頁面總覽

| 頁面 | 路由 | 狀態 | 說明 |
|------|------|------|------|
| 月曆視圖 | `/calendar` | ✅ 完成 | 月份切換、每日訂單摘要、Realtime、響應式、**日期卡右上角 + 鈕快速新增訂單**（共用 `OrderFormDialog`）、**未來 4 天內含未列印訂單的卡片粉紅警示 + 呼吸燈 badge**、**右上角 inline 搜尋框 + 即時 popover 結果列表（debounce 180ms）** |
| 日訂單管理 | `/calendar/[date]` | ✅ 完成 | 新增/編輯/刪除（**編輯時可改訂單日期**）、**付款狀態欄位（列表可一鍵切換 + 編輯 dialog 下拉）**、**分批/追加（複製訂單到多個日期、原訂單品項自動扣減、自動編號 batch_info）**、**資料驅動庫存扣減（product_recipe）**、CSV匯出、Realtime、**今日試吃/耗損/散單 CRUD** |
| 客戶搜尋 | `/search` | ✅ 完成 | 即時搜尋(ilike)、點擊跳轉日期頁；支援 `?q=` URL 預填（從月曆右上搜尋框跳轉而來） |
| 統計儀表板 | `/dashboard` | ✅ 完成 | 6 統計卡片 + 5 Recharts 圖表（含試吃統計） |
| 庫存總覽 | `/inventory` | ✅ 完成 | **整合產品庫存 + 包材庫存於同頁**：蜂蜜蛋糕（條）/ 旋轉筒包裝 / 曲奇 / 包材；**每項依 own `lead_time_days` 計算 D+N 預計庫存**；安全庫存與到貨時間 inline 可編輯；**曲奇可整批隱藏（隱藏時不列入叫貨通知）**；包材 CRUD/入庫/停用；產品入庫；LINE 叫貨通知；Realtime |
| 操作紀錄 | `/activity` | ✅ 完成 | 表格化顯示最近 500 筆寫入操作：日期/時間/操作者/客戶/改動項目/詳情；mount 時順手清理 >30 天紀錄；支援帳號/動作/客戶篩選 |
| 設定 | `/settings` | ✅ 完成（admin only） | 產品/包裝/烙印 CRUD、**新增產品可同步設定原料配方與包材消耗**、每項產品可📋編輯配方；**僅 admin 可進入**（非 admin 顯示無權限卡片） |
| 登入/註冊 | `/login` | ✅ 完成 | 單頁 toggle sign-in / sign-up；已登入自動跳 `/calendar`；註冊自動登入 |
| 唱歌貓咪 | `/cat` | ✅ 完成 | 貓咪頭頂每秒飄出一個彩色音符往上飛，3.6~5.2 秒內淡出；CSS keyframe 配 random sway/rotation。元件 `src/components/cat-eyes.tsx`（`SingingCat`），無需登入可直接訪問 |

**全域 auth 行為**：
- 任何受保護頁面在未登入時自動跳 `/login`
- Session 10 小時固定到期（非 idle timeout），到時自動登出 + 寫紀錄
- 不存在路由 → 已登入跳 `/calendar`、未登入跳 `/login`（不顯示 Next.js 預設 404）
- 預設管理員：`admin / admin888`（可在 Supabase Dashboard `app_users` 表追加其他人）

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
| `023_copy_special_cookie_materials.sql` | 從原味白/可可粉/伯爵藍 的 product_material_usage 按「包裝顏色」複製配方給對應 6 個特殊組合 |
| `024_app_users_auth.sql` | app_users + sign_up/sign_in RPC（pgcrypto bcrypt）+ seed admin/admin888 |
| `025_activity_logs.sql` | activity_logs 表 + log_activity / cleanup_old_activity_logs RPC（30 天自動清理） |
| `026_fix_auth_search_path.sql` | 修正 sign_up / sign_in search_path 為 `public, extensions`，解決 pgcrypto `gen_salt does not exist` |
| `027_stock_adjustment_material.sql` | stock_adjustment_items 加 material_id（試吃/耗損可選包材）、product_id 改 nullable、互斥 CHECK |
| `028_packaging_material_categories.sql` | 新增包材分類表 + packaging_materials.category_id（自訂分類區塊用） |
| `029_deactivate_tube_pkg.sql` | 停用 tube_pkg 三筆產品（四季童話 / 銀河探險 / 樂園馬戲），改由 product_material_usage 接手包裝消耗 |

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

### 2026-05-04 — 移除 tube_pkg name-match 路徑，旋轉筒包裝消耗全交 product_material_usage

**承接前一筆**：使用者已在設定頁為三個旋轉筒口味 + 三個包裝款式設定好 `product_material_usage`（同名包材會自動扣），舊的 hardcoded 路徑可清。

**移除的程式碼**
- `order-form-dialog.tsx`：移除 `calculateDeductions` 函式（原本 = `calculateIngredientDeductions` + tube_pkg name-match），handleSave 改直接用 `calculateIngredientDeductions`；移除 `missingTubePkg` 警示分支
- `calendar/[date]/page.tsx`：同上；`showInventoryWarnings` 拿掉第二個 `missingTubePkg` 參數；handleSplitConfirm 各 split/append 計算點改用 `calculateIngredientDeductions`；handleSaveAdjustment 移除 finishedEntries 中 tube → tube_pkg name-match 的迴圈
- `calendar/page.tsx`：handleSaveAdjustment 同上，移除 `adjMissingTubePkg` 與相關警示

**Migration 029（待 Dashboard 執行）**：把三筆 tube_pkg product 設 `is_active=false`，既有 inventory 紀錄保留以便回溯，但不再顯示或被寫入。

**保留**
- `lib/stock.ts:57` 防禦性 skip（cake_bar/tube_pkg 不算包材消耗）—— 即使 tube_pkg 全停用也保留，避免未來資料異常
- `lib/types.ts` 的 `ProductCategory` 仍含 `'tube_pkg'`（DB CHECK 仍允許）
- 設定頁 / stock-adjustment-dialog 的「原料」mode 下拉仍可選 tube_pkg category，但因 `is_active=false` 過濾後不會出現

**取捨**
- 完全資料驅動：使用者在 `/settings` 編輯 tube + packaging_style 對應的包材消耗，不必再改程式碼
- 缺點：使用者必須先在「包材」建好同名包材且在設定頁配對好 `product_material_usage`，否則訂單下旋轉筒不會扣到任何包裝庫存（會跳「未設定包材對照」警示）

**變更檔案**

| 變更 | 檔案 |
|---|---|
| Migration 029（待 Dashboard 執行） | `supabase/migrations/029_deactivate_tube_pkg.sql`（新增） |
| 移除 calculateDeductions 與 missingTubePkg 警示 | `src/components/order-form-dialog.tsx` |
| 同上 + showInventoryWarnings 簡化 + 各 split/append 計算點 + handleSaveAdjustment 的 tube_pkg 特例 | `src/app/calendar/[date]/page.tsx` |
| handleSaveAdjustment 移除 tube_pkg 特例與警示 | `src/app/calendar/page.tsx` |

---

### 2026-05-04 — 庫存頁與叫貨通知不再顯示「旋轉筒包裝」(tube_pkg)

**需求**：庫存頁的「旋轉筒包裝」區塊（四季童話 / 銀河探險 / 樂園馬戲）冗餘——使用者偏好直接在「包材」區塊看同名包材剩餘數量。

**設計**
- `inventory/page.tsx`：products fetch 從 `IN ('cake_bar', 'tube_pkg', 'cookie')` 改為 `IN ('cake_bar', 'cookie')`，render 移除 tubePkgs section
- `api/line-notify/route.ts`：products 查詢同步排除 tube_pkg，不再對 tube_pkg 發叫貨警示

**未動的部分（重要）**
- DB 中 tube_pkg 產品仍然存在且 active
- 訂單下「旋轉筒-XXX」品項時，`order-form-dialog.tsx:202-209` 仍會 name-match 同名 tube_pkg 產品扣減其 inventory（背景持續累計）
- 若日後想徹底移除 tube_pkg，需另外做：
  1. 改 calculateDeductions 把 tube_pkg name-match 換成 packaging_material name-match（或走 product_material_usage）
  2. 把 tube_pkg 三筆 product 設 `is_active=false`
  3. 用戶在「包材」新增「四季童話 / 銀河探險 / 樂園馬戲」三筆包材

**取捨**
- 純 UI 隱藏，背景邏輯不動 → 風險最低、可隨時還原
- 缺點：tube_pkg 庫存仍會被扣但無人看、無告警；要看到「旋轉筒包材」反映訂單扣減，使用者需自行新增包材並到設定頁設 `product_material_usage`

**變更檔案**

| 變更 | 檔案 |
|---|---|
| products fetch 排除 tube_pkg、render 移除區塊 | `src/app/inventory/page.tsx` |
| 叫貨通知 products 查詢排除 tube_pkg | `src/app/api/line-notify/route.ts` |

---

### 2026-05-04 — 唱歌貓咪 widget 移到 AppShell（全頁面共用）

**需求**：原本只有月曆頁顯示唱歌貓咪，希望切換任一頁面（統計/庫存/紀錄/設定…）都在同一位置看到。

**設計**
- `DraggableCat` 元件本來就是 `position: fixed` + 固定座標，掛在哪個 component 都不影響定位
- 從 `src/app/calendar/page.tsx` 移除 import 與 `<DraggableCat />`
- 在 `src/components/app-shell.tsx`「受保護頁面」分支的最外層 `<div>` 內掛入 `<DraggableCat />`
- 公開頁面（`/login`、`/cat`）early return 不掛貓咪：避免登入畫面浮貓 + `/cat` 本身已是大貓咪展示頁

**取捨**
- 不必建 layout context 或 portal —— `position: fixed` 已脫離文件流，掛在 AppShell 哪個位置都同一視覺結果
- 仍維持 `hidden md:block`：手機 sheet sidebar 沒固定的左下安全區，繼續隱藏避免擠版

**變更檔案**

| 變更 | 檔案 |
|---|---|
| AppShell 加 DraggableCat import 與外層掛點 | `src/components/app-shell.tsx` |
| 月曆頁移除 import 與 `<DraggableCat />` | `src/app/calendar/page.tsx` |
| 元件註解改為「AppShell 全域唱歌貓咪 widget」 | `src/components/draggable-cat.tsx` |

---

### 2026-05-04 — 庫存卡可修正實際數量 + 包材自訂分類

**需求**
1. 庫存卡每張都要能改「目前實際數量」以即時修正盤點誤差（非 D+N 後的數量）
2. 包材區塊要支援自訂分類（區塊名由使用者新增），可把各種包材歸類到對應區塊（例如「蜂蜜蛋糕區」「曲奇餅乾區」）

**設計**

1. **修正實際數量（誤差校正）**
   - 卡片數值旁加「✏️ 修正」鈕（admin only），開 Adjust Dialog
   - Dialog 顯示兩個數字：
     - **目前實際數量** = `SUM(quantity) WHERE date ≤ today`（不含未來訂單預扣，現算現抓）
     - **修正為**（使用者輸入新值）+ 即時顯示差額
   - 確認時寫一筆 `inventory` / `packaging_material_inventory` 記錄：`type='adjustment', date=today, quantity=新值-舊實際, reference_note='manual_adjust:備註'`
   - 該記錄會自動進入 D+N 累積（today ≤ today+N）→ 卡片上的 D+N 預估同步修正
   - 寫入「操作紀錄」`修正實際庫存`，metadata 含 `類型 / 名稱 / 原實際數量 / 新實際數量 / 差額 / 備註`
   - 產品/包材共用同一支 dialog（`AdjustTarget = { kind: 'product'|'material', id, name, unit? }`）

2. **包材自訂分類（Migration 028）**
   - 新表 `packaging_material_categories(id, name UNIQUE, sort_order, created_at)`
   - `packaging_materials.category_id UUID NULL REFERENCES ... ON DELETE SET NULL`（刪分類不會刪包材）
   - 包材區塊改為「按分類分組」渲染：每個分類自成 sub-section，標題列含「重新命名」「刪除」icon；沒分類的包材歸到「未分類」section
   - 標題列旁加「＋ 新增分類」鈕（admin only）→ 開 Add Category Dialog
   - 新增/編輯包材 Dialog 加「分類」下拉（`未分類` 為預設選項）
   - Realtime 監聽 `packaging_material_categories` + `packaging_materials` 變動，多人協作即時同步

**取捨**
- 修正用「寫一筆 adjustment 記錄」而非「直接覆寫過往 inventory」：保留稽核軌跡（誰、何時、原值、新值）+ 不破壞既有累積式設計 + 操作紀錄頁可查
- 「實際當前庫存」每次開 dialog 即時抓（不在 fetchAll 預先計算）：避免每次切頁都跑兩次 SUM；修正使用頻率低
- 分類採「軟連結」（`ON DELETE SET NULL`）：刪分類時包材歸「未分類」，不會誤刪業務資料
- 分類用獨立表而非 enum：使用者要能任意新增/重新命名

**變更檔案**

| 變更 | 檔案 |
|---|---|
| Migration 028（待 Dashboard 執行） | `supabase/migrations/028_packaging_material_categories.sql`（新增） |
| `PackagingMaterialCategory` 介面 + `PackagingMaterial.category_id` | `src/lib/types.ts` |
| 庫存頁加修正按鈕、Adjust Dialog、分類分組渲染、Add/Edit/Delete Category、新增/編輯包材 dialog 加分類下拉、Realtime 監聽包材+分類表 | `src/app/inventory/page.tsx` |

**Migration（待 Dashboard 執行）**
- `028_packaging_material_categories.sql` — 未執行前 `category_id` 欄位不存在，新增/編輯包材寫入 `category_id` 會 RLS 失敗；包材區塊全部歸「未分類」，分類 CRUD 失敗

---

### 2026-04-28 — 唱歌貓咪 widget + LAD 品牌 logo + sidebar 重排版

**需求**：
1. 在月曆頁加一個「會唱歌的貓咪」widget，貓咪頭頂飄出蠟筆風音符
2. 把 LAD 品牌 logo 加到 sidebar 標題上方
3. 移除 sidebar 的 📦 emoji

**設計**

1. **公開展示頁 `/cat`**
   - 元件：`src/components/cat-eyes.tsx` 內 `SingingCat`（檔名沿用早期實驗名稱，元件已換語意）
   - 每秒從貓咪頭頂飄出一個音符（CSS keyframe `cat-note-float`），帶 random sway / rotation / hue
   - 配色取自原圖的粉彩色盤（窗框藍 #7da4be、腮紅 #d6a4a0、耳朵棕 #c89283、暖橘 #e0b46c…）
   - SVG `feTurbulence + feDisplacementMap` 濾鏡 + 0.35px blur 讓音符邊緣呈蠟筆筆觸
   - AppShell 加 `isPublicPage` 例外，`/cat` 不需登入即可訪問

2. **月曆 sidebar 內的常駐 widget**
   - 元件：`src/components/draggable-cat.tsx`（命名沿用「拖曳測試」原型階段，目前是固定位置）
   - 位置：sidebar 內「設定」下方、帳號區上方的空白區
     - `bottom: calc(9rem - 36px)`：貓咪底部離下方分隔線恰 10px
     - `left: calc(2.5rem - 10px)`：靠 sidebar 左側微留白
   - 大小：`SingingCat size={230}`（含音符的視覺區）
   - `pointer-events-none` + `aria-hidden`：不攔截 sidebar 的點擊/讀屏
   - `hidden md:block`：手機隱藏避免擠版（手機 sidebar 是 sheet，沒有固定的左下安全區）

3. **音符飄升參數安全距離計算**
   - 飄升距離由 240px 逐步調整為 150px（因為加了 logo 後 sidebar 變高、設定下移）
   - 音符大小由 26~42px 縮為 17~28px（× 2/3）
   - 量測結果：頂端音符離「設定」連結約 34~42px、貓咪底部離分隔線 10px

4. **Sidebar header 加入 LAD 品牌 logo**
   - `public/lad-logo.png`（1500×832）放於 `<h1>包裝行事曆</h1>` 上方並置中
   - `next/image` 帶 `unoptimized`：本機 `_next/image` 優化端點異常（會回 webp 但 DOM 載入失敗）→ 改直接用原圖
   - `max-w-[170px]` + `h-auto` 自適應 sidebar 寬度
   - header 上下留白加大（`mb-6 + pt-3`）避免擠版
   - `<h1>` 同步移除 📦 emoji，純文字「包裝行事曆」

**取捨**
- 元件命名（`cat-eyes` / `DraggableCat`）保留歷史名稱以免到處改 import；行為已與名稱不符，靠註解說明
- `unoptimized` 等於放棄 next/image 的優化好處，但對單張 sidebar logo 來說影響可忽略
- 早期嘗試過讓貓咪眼睛跟隨滑鼠（canvas 取像素 + 蒙版重貼），最終改為「唱歌」呈現；眼睛追蹤的試作版仍保留在元件內歷史 commit，必要時可回頭

**變更檔案**

| 變更 | 檔案 |
|---|---|
| 唱歌貓咪元件 | `src/components/cat-eyes.tsx`（新增） |
| Sidebar 內貓咪 widget | `src/components/draggable-cat.tsx`（新增） |
| `/cat` 公開展示頁 | `src/app/cat/page.tsx`（新增） |
| AppShell：logo + 公開頁例外 + 移除 📦 | `src/components/app-shell.tsx` |
| 月曆頁掛入貓咪 widget | `src/app/calendar/page.tsx` |
| 音符飄升 keyframe | `src/app/globals.css` |
| 貓咪原圖 | `public/cat.png`（新增） |
| 品牌 logo | `public/lad-logo.png`（新增） |

**相關 commit**：
- `9885e23` 唱歌貓咪頁 `/cat`
- `b5e653b` 月曆頁 sidebar 加上唱歌貓咪
- `3cf704e` 放大為 200 / 下移 10 / 音符高度 230
- `5adb56c` 整體左移 10px
- `c6bffdc` 放大為 230 / 再下移 15 / 音符縮 1/3 / 高度 210
- `8e119f6` 標題上方加入 LAD 品牌 logo
- `5b583c0` 移除 📦 emoji、貓咪底部距分隔線 10px

### 2026-04-28 — 耗損/原料下拉支援包材（小/中/大紙箱）

**需求**：「耗損」+「原料」mode 的下拉選單除了既有的 `cake_bar / tube_pkg`，還要列出包材庫存中的「小紙箱、中紙箱、大紙箱」，選擇後直接扣減 `packaging_material_inventory`。

**設計**

1. **Schema 變動 — Migration 027**
   - `stock_adjustment_items` 新增 `material_id UUID` 欄位（REFERENCES `packaging_materials(id)`）
   - `product_id` 改為 nullable
   - CHECK constraint：`product_id` 與 `material_id` 互斥（擇一非 null）
   - 加部分索引 `idx_stock_adjustment_items_material`（WHERE material_id IS NOT NULL）

2. **`StockAdjustmentDialog` 新 prop `materials`**
   - 型別：`{ id: string; name: string }[]`（呼叫者過濾 `name in ['小紙箱','中紙箱','大紙箱'] AND is_active=true`）
   - 「耗損 + 原料」mode 下拉除了 `ingredientProducts`，再列出 materials；
     option `value="material:<UUID>"`、顯示 `名稱（包材）`，前面加 disabled separator `──── 包材 ────`
   - `selectedProduct / needsPackaging` 跳過 prefix 為 `material:` 的選項

3. **`AdjustmentItemInput.productId` 用 prefix 區分**
   - 純 UUID = product
   - `material:<UUID>` = material
   - 改動小（不需介面增欄位），handleSave 解析 prefix

4. **`handleSaveAdjustment` 兩處同步修改**（月曆頁 + `[date]/page.tsx`）
   - `itemRows`：material → `product_id=null, material_id=UUID`；product → `product_id=UUID, material_id=null`
   - 分類迴圈：directIngredient（product 原料）/ directMaterial（包材）/ finishedEntries（成品）
   - `totalIngredient = directIngredient + recipe 展開 + tube_pkg 特例`
   - `totalMaterial = directMaterial + matResult.deductions`（若有 finished cake/tube）
   - `replaceAdjustmentInventory` RPC 仍以 `(adjustmentId, totalIngredient, totalMaterial, date)` 簽章呼叫，負責 inventory + packaging_material_inventory 兩邊同步

5. **`handleEditAdjustment` 載入既有 adjustment 時**
   - `item.material_id` 有值 → `productId = "material:<material_id>"`（與 dialog option value 對齊）
   - 否則 `productId = item.product_id ?? ''`

6. **List 顯示**（`[date]/page.tsx`）
   - `it.material_id` 有值 → 從 `boxMaterials` 找名稱、modeLabel = 「包材」
   - 否則沿用既有「成品 / 原料」邏輯

7. **`fetchAdjustments` select 加 `material_id`**

8. **抓 boxMaterials**（兩個 page mount 時）
   - `from('packaging_materials').select('id, name').in('name', ['小紙箱','中紙箱','大紙箱']).eq('is_active', true)`
   - 找不到（包材還沒建）→ dialog 包材區塊不顯示，無錯誤

**前置條件**
- 包材庫存頁（`/inventory`）需先新增「小紙箱、中紙箱、大紙箱」三筆 active 包材
- Migration 027 需在 Supabase Dashboard 執行；未執行前 `material_id` 欄位不存在，dialog 仍可選但 INSERT 會 RLS 失敗

**`StockAdjustmentItem` 型別擴充**
- `product_id: string | null`（原為 string）
- 加 `material_id: string | null`
- 加 `material?: PackagingMaterial`

**變更檔案**

| 變更 | 檔案 |
|---|---|
| Migration 027（待 Dashboard 執行） | `supabase/migrations/027_stock_adjustment_material.sql`（新增） |
| `StockAdjustmentItem` 型別擴充 | `src/lib/types.ts` |
| Dialog 加 materials prop + UI prefix 邏輯 | `src/components/stock-adjustment-dialog.tsx` |
| 月曆頁 fetch boxMaterials + handleSaveAdjustment 解析 prefix + 傳 materials | `src/app/calendar/page.tsx` |
| 日頁面 fetchAdjustments 加 material_id + handleEditAdjustment 組 prefix + handleSaveAdjustment 解析 prefix + List 顯示 material name + Dialog 傳 materials | `src/app/calendar/[date]/page.tsx` |

---

### 2026-04-28 — 「今日試吃/耗損/散單」入口從日頁面移到月曆頁

**變更**
- 月曆頁右上角搜尋框左邊新增按鈕「🍰 今日試吃/耗損/散單」，點擊開啟 `StockAdjustmentDialog`
- Dialog 寫入時 date 一律為 `today`（`format(new Date(), 'yyyy-MM-dd')`），取代舊的「該頁日期」邏輯
- 月曆頁 mount 時抓 products / packaging_styles / product_recipe / product_material_usage 作為 dialog 與 inventory 計算所需參考資料
- `handleSaveAdjustment` 邏輯比照日頁面：finished/ingredient 分類 → recipe 展開 → tube_pkg 特例 → material 對照 → `replaceAdjustmentInventory` RPC → activity log；包材警示沿用月曆頁 `materialWarning` state（8 秒自動消失）
- 日頁面（`[date]/page.tsx`）：移除右上角的「🍰 今日試吃/耗損/散單」按鈕（只是新增入口）；保留 list 顯示與每筆紀錄的編輯/刪除 icon、`StockAdjustmentDialog` state、`handleSaveAdjustment / handleDeleteAdjustment / handleEditAdjustment` handler — 編輯既有紀錄的流程不變

**取捨**
- 「新增」入口統一在月曆頁的 today，符合實際業務（試吃/耗損/散單通常是當下記錄）
- 日頁面仍可看/編輯該日期的既有紀錄，但無法直接「新增該日期的非 today 紀錄」（極少情境）
- 月曆頁的 dialog 為「新增 only」流程，無 list、無編輯模式，邏輯精簡

**變更檔案**

| 變更 | 檔案 |
|---|---|
| 月曆頁加按鈕 + reference data fetch + handleSaveAdjustment + Dialog 元件 | `src/app/calendar/page.tsx` |
| 日頁面移除「新增」按鈕（保留 dialog state 與 handler） | `src/app/calendar/[date]/page.tsx` |

---

### 2026-04-28 — 追加 dialog UI 細修（單口味隱藏 + 文字截斷）

**修正**
1. **「沒有」類別 + 選了一個口味 → 其他口味立即隱藏**
   - 每筆追加只能一種蜂蜜蛋糕/旋轉筒口味（與「一種」規則一致）
   - 在 row map 內 derive `cakeSelectedId / tubeSelectedId`，再用 `cakeListToShow / tubeListToShow` 切換 list
   - 數量歸 0 後其他口味自動重新顯示

2. **移除 `truncate` class，改用 `break-words`**
   - 蜂蜜蛋糕長名稱（如「經典原味+伯爵紅茶」）原本被省略為「...」，無法分辨口味
   - 統一替換 5 處 `text-xs text-gray-600 flex-1 truncate` → `text-xs text-gray-600 flex-1 break-words`
   - 範圍含分批/追加各 section + 單入蛋糕 + 曲奇

**變更檔案**

| 變更 | 檔案 |
|---|---|
| 加 cakeSelectedId/tubeSelectedId/listToShow + truncate → break-words | `src/components/split-order-dialog.tsx` |

---

### 2026-04-28 — 追加訂單品項規則細化（按「訂單群是否已有此類別」差異化）

**需求 / 規則確認**
- 每位客戶的訂單群（同 batch_group_id 的所有訂單）只能同時有：**一種蜂蜜蛋糕、一種旋轉筒、多種曲奇**
- 「一種」= 一張訂單共用一個包裝/烙印（口味本身仍可多種，但要走分批/追加流程）
- 追加邏輯：
  - 原訂單群**已有**蜂蜜蛋糕 → 限原口味+原包裝+原烙印的數量追加
  - 原訂單群**已有**旋轉筒 → 限原口味+原包裝的數量追加
  - 原訂單群**沒有**蜂蜜蛋糕 → 顯示全部口味 + 包裝/烙印下拉讓使用者選新規格
  - 原訂單群**沒有**旋轉筒 → 顯示全部口味 + 包裝下拉
  - 單入蛋糕：保守處理 — 已有 → 限原口味；沒有 → 不開放（per-item packaging 複雜度高）
  - 曲奇：永遠任意多選（無包裝/烙印）

**設計**

1. **SplitOrderDialog 追加 section 完整重寫**
   - 移除舊的「該客戶歷史品項清單」單一 list 與單一 grid 輸入
   - 改為按類別分四個 sections（cake / tube / single_cake / cookie）
   - 每個 section 依 `hasExistingXxx` 切換顯示：
     - 已有 → 顯示 `existingXxx` 口味（限原口味），UI 提示「沿用原訂單包裝/烙印」
     - 沒有 → 顯示 `allXxx` 口味 + 包裝/烙印下拉（cake 兩個下拉、tube 一個下拉）

2. **AppendInput 介面擴充**
   - 加 `cakePackagingId?: string | null`、`cakeBrandingId?: string | null`、`tubePackagingId?: string | null`
   - 都是 effective 值：confirm 時根據 `hasExistingXxx` 規則決定沿用 originalXxx 還是用 row 中選的 newXxx
   - 該 row 沒有對應品項時為 null

3. **Validation**
   - 原訂單沒有 cake/tube + 該 row 有對應品項 + 沒選新包裝/烙印 → alert
   - 已有 cake/tube + 該 row 含非原口味 → alert（UI 已限制，雙保險）
   - 單入蛋糕：非原訂單品項 → alert

4. **handleSplitConfirm: 多欄位 override**
   - `buildOrderHeader(date, overrides?: { cakePackagingId?, cakeBrandingId?, tubePackagingId? })` 用可選 overrides 物件
   - splits 不傳（沿用 form 全欄位）
   - appends 傳 `{ cakePackagingId, cakeBrandingId, tubePackagingId }`（SplitOrderDialog confirm 時已計算為 effective 值）
   - inventory 計算迴圈同樣按 override 計算扣減：split 用 form 欄位、append 用 override（避免錯扣 cake/tube 包材）

**取捨**
- effective 值計算放在 SplitOrderDialog 內部，`[date]/page.tsx` 只消費結果（不重複判斷邏輯）
- `single_cake` 暫不開放新規格（per-item packaging 對映複雜，user 也未明確要求）
- 曲奇沒有包裝/烙印，簡化為任意多選（不分 existing/non-existing）

**新增的 SplitOrderDialog props**
- `cakePackagingStyles / cakeBrandingStyles / tubePackagingStyles: { id; name }[]` — 各類別的下拉選項
- `originalCakePackagingId / originalCakeBrandingId / originalTubePackagingId?: string | null` — 原訂單已有的規格（繼承用）

**變更檔案**

| 變更 | 檔案 |
|---|---|
| SplitOrderDialog 全文重寫追加 section + AppendInput 擴充 cake/tube override + validation | `src/components/split-order-dialog.tsx` |
| SplitOrderDialog 呼叫處加 6 個新 props + buildOrderHeader 接 overrides 物件 + inventory 用 cake/tube override 計算 | `src/app/calendar/[date]/page.tsx` |

---

### 2026-04-28 — 新增訂單同名客戶偵測 +「非相同客戶」確認

**需求**：避免使用者在新增訂單時把與同名同姓既有客戶的訂單建成獨立訂單，導致「分批/追加」UI 上的兄弟批次連動錯亂。

**設計**

1. **同名偵測（debounce 180ms）**
   - 僅新增模式（`!editingOrder`）+ dialog 開啟時對 `customer_name` 做精確匹配查詢
   - 編輯模式不檢測（修正錯字、改名等情境會永遠匹配自己）
   - 共用元件 `OrderFormDialog`（月曆右上 + 鈕）與 `[date]/page.tsx` 內建 dialog（日訂單頁 + 鈕、編輯入口）兩處同步處理

2. **UI 提醒**
   - 客戶姓名 Label 旁顯示紅字：「已存在客戶，請使用分批/追加功能」
   - Input 下方出現 checkbox：「非相同客戶（建立獨立訂單）」

3. **儲存守門**
   - 新增模式 + 同名 + 未勾選「非相同客戶」 → 儲存按鈕 disabled
   - handler 開頭加 `if (!editingOrder && duplicateName && !confirmedDifferent) return` 雙保險
   - 勾選「非相同客戶」後按鈕解鎖

4. **batch_group_id 顯式分配**
   - 勾選「非相同客戶」時，新訂單 `batch_group_id = crypto.randomUUID()`（其他情境保持 NULL）
   - 確保即便未來該訂單被「分批/追加」，也不會跟現有同名訂單在分批 UI 上連動
   - 雖然 NULL 本來就不會誤連動（migration 020 設計），但顯式分配 UUID 表達「這是使用者確認過的獨立訂單群」

**state 重置邏輯**
- `formName / editingOrderId / dialogOpen` 任一變動 → reset `confirmedDifferent`（避免改名後仍套用前次確認）
- 編輯模式 / dialog 關閉 / formName 為空 → `setDuplicateName(false)`
- 防止下次 open dialog 時殘留前次紅字或勾選狀態

**變更檔案**

| 變更 | 檔案 |
|---|---|
| OrderFormDialog（月曆右上 + 鈕快速新增） | `src/components/order-form-dialog.tsx` |
| 日訂單頁內建 dialog（+ 鈕新增 / 編輯） | `src/app/calendar/[date]/page.tsx` |

---

### 2026-04-28 — 庫存頁 admin guard + LINE 推播 UID 更新

**1. 庫存頁僅 admin 可編輯（其他人僅可查看）**

- 加 `useCurrentUserClient` 取得 user，衍生 `isAdmin = !!user?.is_admin`
- UI 對非 admin 隱藏編輯入口：
  - 標題列右上「叫貨通知 / 產品入庫 / 包材入庫 / 新增包材」整組按鈕
  - 產品卡片內 D+N badge 點擊（改顯示為靜態 span，視覺保留但不可點）
  - 安全庫存 pencil 編輯按鈕
  - 包材卡片內三個 icon（編輯 / 停用 / 刪除）
  - 曲奇 section 標題旁的「隱藏 / 顯示」切換
  - 已停用包材區塊（整段不渲染）
- 寫入 handler 全部加 `if (!isAdmin) return` 守門，防止透過 dev tools 直接呼叫；handler 列表：`startEditSafety / saveEditSafety / startEditLead / saveEditLead / handleProductInbound / handleMaterialInbound / handleAddMaterial / openMatEditDialog / handleEditMaterial / handleDeleteMaterial / handleToggleMatActive / handleLineNotify / toggleCookiesVisible`
- 不擋頁面載入：mounted 前 isAdmin 為 false，會看到 view-only 一瞬間，admin 登入完 UI 自動切換為可編輯
- 安全層仍由 RLS 把關（anon 全開，client guard 只是 UX 層）

**2. LINE 自動推播 UID 更新**

- 新 UID：`U552a2551dfa5df627fb96623b9e750b9`
- 已同步更新 `.env.local`（本地）+ Vercel Production env vars（透過 `vercel env rm/add` CLI）
- 影響範圍：手動「叫貨通知」按鈕 + Vercel Cron 每日 09:00 AM 自動推播
- 程式碼層 `/api/line-notify` 不變，UID 改動僅在環境變數

**變更檔案**

| 變更 | 檔案 |
|---|---|
| 庫存頁 admin guard（import / state / handler 守門 / UI 隱藏） | `src/app/inventory/page.tsx` |
| LINE_TARGET_ID 本地值 | `.env.local`（不進 git） |
| LINE_TARGET_ID 生產值 | Vercel Dashboard env vars（透過 vercel CLI 同步） |

---

### 2026-04-28 — 帳號系統強化（session 過期、全域 guard、操作紀錄中文化、404 導向）

承續同日「帳號系統 + 操作紀錄 + 設定頁 admin guard」初版，後續補上多項細節：

**1. 未登入強制跳轉（全 app guard）**
- AppShell 加 `useEffect` 偵測 `mounted && !user && !isLoginPage` → `router.replace('/login')`
- 未登入訪問任何受保護頁面（calendar / dashboard / inventory / activity / settings）都會被攔截
- 過渡期顯示「驗證中...」中性畫面，避免閃過受保護內容
- DB 安全仍由 RLS 把關，但 UX 層完全擋住匿名操作

**2. Session 10 小時固定到期自動登出**
- localStorage 結構從 `AuthUser` 改為 `StoredSession`：多一個 `expiresAt` 欄位
- `signIn / signUp` 寫入時設 `expiresAt = Date.now() + 10h`
- `readUser` 讀取時檢查過期 → 過期清掉 storage + 回傳 null
- AppShell 加 `setTimeout` 在 `expiresAt` 到時自動 `signOut + replace('/login')` 並寫「自動登出」紀錄（reason: Session 10 小時到期）
- 固定時長（非 idle timeout）：避免同電腦不同人接手時混淆紀錄

**3. 已登入訪問 `/login` → 自動跳 `/calendar`**
- LoginPage 加 `useEffect` 偵測 `mounted && user` → `router.replace('/calendar')`
- 過渡期顯示「驗證中...」避免閃過表單

**4. 不存在路由優雅導向**
- 新增 `src/app/not-found.tsx`：依登入狀態 redirect
  - 已登入 → `/calendar`
  - 未登入 → `/login`
- 取代 Next.js 預設 404 錯誤頁

**5. 修復 React error #185（Maximum update depth）**
- 原 `readUser` 每次 `JSON.parse` 都回新物件 reference
- `useSyncExternalStore` 認為 store 一直在變 → 無限 re-render → 跳轉迴圈 → 頁面崩潰
- 修法：module-level cache `cachedRaw / cachedUser / cachedExpiresAt`，只在 raw localStorage 字串變動時 re-parse；回傳同一 reference

**6. Migration 026 — 修正 pgcrypto search_path**
- Supabase 把 pgcrypto 安裝在 `extensions` schema
- Migration 024 的 RPC `SET search_path = public` 蓋掉預設 → 註冊報錯 `gen_salt(unknown) does not exist`
- 修法：CREATE OR REPLACE function 把 search_path 改為 `public, extensions`

**7. 操作紀錄全面正體中文化 + 動作細分**

紀錄頁從卡片改表格化：日期 / 時間 / 操作者 / 客戶 / 改動項目 / 詳情。

訂單動作根據實際變動細分（OrderFormDialog handleSave 比對前後值）：

| 情境 | action |
|---|---|
| 新增訂單 | `新增訂單` |
| 編輯訂單只改 `order_date` | `改日期`（含 `原日期` metadata） |
| 編輯訂單只改 items | `改數量`（含 `原品項` metadata） |
| 編輯訂單兩者都改 | `改日期+改數量` |
| 編輯訂單只改其他欄位（付款/狀態/包裝） | `編輯訂單` |
| 刪除訂單 | `刪除訂單` |
| 列印切換 | `列印訂單` / `取消列印` |
| 付款切換 | `標記已付款` / `標記未付款` |
| 分批訂單 / 追加訂單 | `分批訂單` / `追加訂單`（含分批/追加日期清單） |
| 試吃/耗損/散單 | `新增/編輯/刪除${類型}紀錄` |
| 設定 CRUD | `新增/編輯/啟用/停用 + 產品/包裝/烙印/常用` |
| 帳號操作 | `登入 / 登出 / 自動登出 / 註冊帳號` |

metadata key 全中文：`客戶 / 日期 / 原日期 / 付款狀態 / 品項 / 原品項 / 類別 / 類型 / 帳號 / 原因` 等。

**8. 訂單紀錄詳情顯示實際品項**
- 取消「品項總數」（只顯示總和），改為「品項」列出 `品名 ×數量、品名 ×數量`（用全形頓號分隔）
- 編輯訂單若品項有變動，多帶「原品項」顯示變動前明細
- `付款` key 改為 `付款狀態`，值用中文（已付款/未付款）

**變更檔案（這一輪）**

| 變更 | 檔案 |
|---|---|
| Migration 026（pgcrypto search_path 修正） | `supabase/migrations/026_fix_auth_search_path.sql`（新增） |
| auth localStorage 結構加 expiresAt + cache reference 修 infinite loop + getSessionExpiresAt | `src/lib/auth.ts` |
| AppShell 全域 guard + 10h session timer + 自動登出 logActivity | `src/components/app-shell.tsx` |
| LoginPage 已登入跳 /calendar + 中文 logActivity（註冊帳號 / 登入） | `src/app/login/page.tsx` |
| 不存在路由處理 | `src/app/not-found.tsx`（新增） |
| 操作紀錄頁改表格化 + pickCustomer / formatDetail helper | `src/app/activity/page.tsx` |
| 訂單動作細分 + metadata 中文化 + 列出實際品項 | `src/components/order-form-dialog.tsx` |
| 訂單刪除/列印/付款/分批/追加/試吃耗損 中文 action 與 metadata | `src/app/calendar/[date]/page.tsx` |
| 設定 CRUD 中文 action 與 metadata | `src/app/settings/page.tsx` |

**Migration（待 Dashboard 執行）**
- `026_fix_auth_search_path.sql` — 未執行前 sign_up / sign_in 都會回 `gen_salt(unknown) does not exist`，註冊登入完全失敗

---

### 2026-04-28 — 月曆即時搜尋 + 全域暖色配色 + UI 字體放大

**1. 搜尋入口從側邊欄移到月曆右上**
- AppShell `navItems` 移除「搜尋」項目（檔案內 import 也刪掉 Search icon）
- 月曆頁 `<` 前一月按鈕左邊插入 inline 搜尋框：Search icon + Input + form
- 保留 `/search` 路由：搜尋頁仍存在（直接 URL 訪問仍可用，提供完整列表 + 編輯功能）

**2. 即時搜尋（debounce + popover）**
- `searchQuery` onChange 不用按 Enter 即觸發；`useEffect` 觀察 query 變動 180ms 後執行 `ilike '%q%'`
- 結果在搜尋框下方絕對定位浮動顯示前 10 筆（客戶名 / 日期 / 品項 / 列印付款狀態）
- 點結果 → `router.push('/calendar/${date}')`（不離開月曆 layout）
- 點外部或 ESC → 關閉 popover
- 結果 ≥ 10 筆 → 顯示「查看完整結果 →」按鈕跳到 `/search?q=`
- 保留按 Enter 跳完整結果頁的 fallback
- search 頁 mount 時讀 `window.location.search` 的 `?q=` 預填並自動執行搜尋

**3. 全域暖色配色**

`:root` variables 改為 oklch 暖色系（hue 50-85，米黃→淺橘）：

| 變數 | 舊值（純灰階） | 新值（暖色） |
|---|---|---|
| `--background` | `oklch(1 0 0)` | `oklch(0.97 0.018 85)` |
| `--foreground` | `oklch(0.145 0 0)` | `oklch(0.22 0.015 50)` |
| `--card` | `oklch(1 0 0)` | `oklch(0.99 0.012 85)` |
| `--primary` | `oklch(0.205 0 0)` | `oklch(0.32 0.05 50)` |
| `--accent` | `oklch(0.97 0 0)` | `oklch(0.91 0.028 75)` |
| `--ring` | `oklch(0.708 0 0)` | `oklch(0.65 0.06 60)` |
| sidebar 系列 | 純灰 | 比 background 略深的暖色 |

對比：background L=0.97 vs foreground L=0.22 → 約 7:1，閱讀無壓力。

**4. AppShell 硬編碼 gray 全部改 theme-aware**
- `bg-gray-50/white` → `bg-background/sidebar`
- `text-gray-XXX` → `text-foreground/muted-foreground`
- `border-gray-200` → `border-sidebar-border`
- `bg-blue-50 text-blue-700`（active nav）→ `bg-accent text-accent-foreground`

**5. 整體字體與間距放大 1.3 倍**
- `globals.css` 加 `html { font-size: 130% }`
- Tailwind 4 用 rem 為基底，root font-size 變化 → 所有 `text-sm`、`p-4`、`w-20`、`h-8` 全部按比例放大
- 不影響 `px` 寫死的 icon 大小、border 厚度

**6. Dialog 標題與欄位重疊修正（1.3x 環境下）**
- `DialogContent`：`gap-4` → `gap-6` + `pt-5`（標題上方留白）
- `DialogTitle`：`leading-none` → `leading-tight`（給標題自身行高）
- `DialogHeader`：加 `pr-8` 避免長標題被右上角 X 鈕遮到

**7. Label 加粗 + 拉開與下方 Input 距離**
- `font-medium` → `font-semibold`
- `leading-none` → `leading-tight`
- 加 `mb-1.5`

**8. 訂單列表內 4 處字體放大（rem-based 跟著 1.3x scale）**
- 付款 pill / 品項 badge / 包裝烙印 badge / 同客戶其他批次：`text-[10px]`（固定 px，不受 html scale 影響） → `text-xs`（0.75rem，約 1.56x）

**變更檔案**

| 變更 | 檔案 |
|---|---|
| 暖色 :root variables + html 130% | `src/app/globals.css` |
| AppShell theme-aware classes + 移除側邊欄搜尋 | `src/components/app-shell.tsx` |
| 月曆頁 inline 搜尋框 + debounce + popover | `src/app/calendar/page.tsx` |
| search 頁讀 ?q= 預填 | `src/app/search/page.tsx` |
| Dialog 三處間距修正 | `src/components/ui/dialog.tsx` |
| Label 加粗 | `src/components/ui/label.tsx` |
| 訂單列表 4 處 text-xs | `src/app/calendar/[date]/page.tsx` |

---

### 2026-04-28 — 帳號系統 + 操作紀錄 + 設定頁 admin guard

**需求**：
1. 加帳號註冊/登入（不要 email 驗證）
2. 左側新增操作紀錄頁，保存 30 天自動清理
3. 紀錄所有帳號的寫入操作
4. 設定頁僅 admin / admin888 可操作

**設計**

- **Migration 024**：自建 app_users（不用 Supabase Auth）+ pgcrypto bcrypt 密碼雜湊 + SECURITY DEFINER RPC `sign_up` / `sign_in`，預設 seed `admin / admin888` (is_admin=TRUE)。anon 不能直接 SELECT app_users，所有讀寫都走 RPC。
- **Migration 025**：activity_logs 表 + RPC `log_activity(username, action, target, metadata)` + `cleanup_old_activity_logs()`（DELETE WHERE created_at < NOW() - INTERVAL '30 days'）。
- **Vercel Cron**：新增 `/api/cleanup-activity` 路由 + cron 每日 01:30 呼叫清理 RPC（與 line-notify 錯開 30 分鐘）。
- **Client-side auth**：用 localStorage 儲存 `{ id, username, is_admin }` + `useSyncExternalStore` 確保多元件即時更新；登入/登出/註冊都呼叫 RPC。安全層仍由 Supabase RLS 把關（anon 全開，本地登入只用於識別當前操作者）。
- **登入/註冊頁** `/login`：單一頁面 toggle 切換 sign-in / sign-up，註冊後自動登入並寫入 `帳號.註冊` log。
- **操作紀錄頁** `/activity`：列出最近 500 筆紀錄；mount 時順手呼叫 cleanup RPC（雙重保險）；支援按帳號/動作/目標篩選。
- **AppShell**：加入「紀錄」nav 項目（所有人可見）；「設定」項目加 `adminOnly: true` flag，非 admin 不顯示（直接點 URL 也會被 settings 頁的 guard 擋）；底部顯示當前帳號 + 登出按鈕，未登入則顯示登入入口。
- **設定頁 admin guard**：未登入或非 admin 顯示「無權限」卡片 + 跳轉 `/login` 連結。
- **logActivity 覆蓋範圍**（首批）：訂單新增/編輯/刪除/列印切換/付款切換、試吃耗損散單新增/編輯/刪除、設定產品 CRUD/改名/啟停/常用切換、包裝/烙印 CRUD/啟停、登入/登出/註冊。

**取捨**：
- **不用 Supabase Auth**：用戶要求免 email 驗證，自建簡易帳密更直觀。
- **localStorage 而非 cookie/JWT**：客戶端識別足夠（DB 安全已由 RLS 把關），免去 server session 維護。
- **首批不覆蓋所有寫入操作**：庫存入庫、安全庫存編輯、包材 CRUD、分批/追加 等暫未加 log，等用戶反饋再補。

**變更檔案**

| 變更 | 檔案 |
|---|---|
| Migration 024 / 025 | `supabase/migrations/024_app_users_auth.sql` / `025_activity_logs.sql` |
| Auth helpers (localStorage + RPC + hooks) | `src/lib/auth.ts`（新增） |
| logActivity helper | `src/lib/activity.ts`（新增） |
| 登入/註冊頁 | `src/app/login/page.tsx`（新增） |
| 操作紀錄頁 | `src/app/activity/page.tsx`（新增） |
| 清理 cron 路由 | `src/app/api/cleanup-activity/route.ts`（新增） |
| Vercel cron 排程 | `vercel.json` |
| AppShell（紀錄項目 / admin-only 設定 / 登入區塊 / 登出） | `src/components/app-shell.tsx` |
| 設定頁 admin guard + 各 CRUD logActivity | `src/app/settings/page.tsx` |
| 訂單 CRUD logActivity | `src/components/order-form-dialog.tsx`、`src/app/calendar/[date]/page.tsx` |

**Migrations（待 Dashboard 執行）**
- `024_app_users_auth.sql` — 未執行前所有 sign_in/sign_up 都會 alert RPC not found；無法以 admin 進設定頁
- `025_activity_logs.sql` — 未執行前 logActivity 失敗（console.warn 不阻塞）；操作紀錄頁空白

### 2026-04-28 — 曲奇特殊組合包材配方複製

**需求**：6 個曲奇特殊組合（原味粉/原味藍/伯爵白/伯爵粉/可可白/可可藍）剛被補入，沒有任何 `product_material_usage` 配方，下單時包材不會被扣減。需參考既有 3 個曲奇配方批次套用。

**對應規則（同包裝顏色共用配方；曲奇命名為「口味+顏色」，配方按顏色而非口味分配）**

| 顏色 | 來源（既有有配方） | 目標（新組合套用相同配方） |
|---|---|---|
| 白 | 原味白 | 可可白、伯爵白 |
| 粉 | 可可粉 | 原味粉、伯爵粉 |
| 藍 | 伯爵藍 | 原味藍、可可藍 |

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

### 低優先

1. **自訂域名** — 可在 Vercel Dashboard > Domains 設定
2. **匯出格式擴充** — 目前僅支援 CSV，可考慮加入 PDF 列印排版

### 已完成

- ✅ Migration 013/014 已於 Supabase Dashboard 執行（2026-04-22）
- ✅ Realtime publication 已啟用 5 張表（2026-04-22 端對端測試驗證）
- ✅ 散單/試吃/耗損 finished mode 補 tube_pkg 扣減（2026-04-22 程式碼修復，待 015 啟用 product 後生效）
- ✅ Migration 015 + 016 + 017 已執行（2026-04-27 用戶回報完成）
- ✅ Migration 018 + 019 已執行（2026-04-28 用戶回報完成 — 付款狀態欄位、per-product lead_time/可見性 全面啟用）
- ✅ Migration 022 + 023 已執行（2026-04-28 — 曲奇 is_common 欄位 + 6 個特殊組合補入 + 包材配方複製）
- ✅ Migration 024 + 025 + 026 已執行（2026-04-28 — app_users 認證 + activity_logs + pgcrypto search_path 修正）
- ✅ 庫存頁 admin guard：僅 admin 可編輯，非 admin 僅可查看（2026-04-28）
- ✅ LINE 自動推播 UID 更新為 `U552a2551dfa5df627fb96623b9e750b9`（2026-04-28，已同步 .env.local + Vercel production env）

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
