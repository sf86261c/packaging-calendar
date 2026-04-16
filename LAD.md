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
| 資料庫 | Supabase (PostgreSQL) + RLS |
| 認證 | Supabase Auth (email/password) |
| 部署 | Vercel (Hobby plan, 自動 CI/CD) |
| 圖表 | Recharts 3.8 |
| 即時同步 | Supabase Realtime |

## 功能清單

### 頁面總覽

| 頁面 | 路由 | 狀態 | 說明 |
|------|------|------|------|
| 登入/註冊 | `/login` | ✅ 完成 | Supabase Auth，email/password |
| 月曆視圖 | `/calendar` | ✅ 完成 | 月份切換、每日訂單摘要、Realtime、響應式 |
| 日訂單管理 | `/calendar/[date]` | ✅ 完成 | 新增/編輯/刪除、庫存扣減、CSV匯出、Realtime |
| 客戶搜尋 | `/search` | ✅ 完成 | 即時搜尋(ilike)、點擊跳轉日期頁 |
| 統計儀表板 | `/dashboard` | ✅ 完成 | 5 統計卡片 + 4 Recharts 圖表 |
| 產品庫存 | `/inventory` | ✅ 完成 | 蛋糕條/曲奇/旋轉筒包裝庫存、日期查詢、Realtime |
| 包材庫存 | `/materials` | ✅ 完成 | 包材 CRUD、編輯/刪除、入庫、階層式用量對照、日期查詢 |
| 設定 | `/settings` | ✅ 完成 | 產品/包裝/烙印 CRUD（新增/行內編輯/停用）、包裝/烙印可選擇適用類別 |

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

- **新增/編輯/刪除**：完整 CRUD（筆圖示=編輯、垃圾桶=刪除）
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

### 產品庫存

- 蛋糕條（cake_bar）：經典原味/伯爵紅茶/茉莉花茶
- 曲奇（cookie）：顯示順序 綜合白→綜合粉→綜合藍→原味白→可可粉→伯爵藍
- 旋轉筒包裝（tube_pkg）：四季童話/銀河探險/馬戲團
- **D+10 預計庫存**：預設顯示未來 10 天後的預計庫存餘額（依訂單日期篩選 inventory.date）
- **日期選擇器**：可切換至任意日期查看庫存，預設 D+10；可點「D+10」按鈕快速回到預設
- **LINE 叫貨通知**：
  - 右上角「叫貨通知」按鈕（手動測試用），呼叫 `/api/line-notify` 統一端點
  - **每日 9:00 AM 自動檢測**（Vercel Cron，UTC 1:00 = 台灣 9:00）
  - 產品檢查：D+15 的 cake_bar（經典原味/伯爵紅茶/茉莉花茶）+ tube_pkg 庫存
  - 包材檢查：每種包材依各自的 D+lead_time_days，若預計到貨日庫存低於安全庫存才通知
  - 新增包材自動適用（查全部 active materials）
- 安全庫存警示 + 進度條
- Realtime 即時同步

### 包材庫存

- 包材品項 CRUD（名稱、單位、安全庫存、**到貨時間 D+?**）+ 編輯/刪除/停用
- **到貨時間（lead_time_days）**：每種包材可設定叫貨後幾天到貨，用於叫貨通知判斷
- 入庫紀錄管理
- **階層式用量對照**：產品類別 → 口味 → 包裝款式 → 多種包材組成
- 用量對照分組顯示（按產品+包裝分組）
- **日期選擇器**：歷史庫存查詢
- 低庫存警示

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
orders           — 訂單 (order_date, customer_name, status, batch_info, printed,
                    cake_packaging_id, cake_branding_id,
                    tube_packaging_id,
                    single_cake_packaging_id, single_cake_branding_text)
order_items      — 訂單品項 (order_id, product_id, quantity, packaging_id)
                   packaging_id: 單入蛋糕 per-item 包裝
inventory        — 庫存紀錄 (product_id, date, type, quantity, reference_note)
```

### 包材相關表

```
packaging_materials          — 包材主檔 (name, unit, safety_stock, is_active)
packaging_material_inventory — 包材庫存紀錄 (material_id, type, quantity, reference_note)
product_material_usage       — 產品→包材用量對照 (product_id, packaging_style_id, material_id, quantity_per_unit)
```

### 庫存扣減機制

- 訂單建立時：根據品項自動插入 `inventory` 記錄（type='outbound', quantity=負數）
- `reference_note` 格式：`order:{orderId}`，用於追蹤和回沖
- **date 欄位設為訂單日期**：庫存記錄的 `date` 設為 `order_date`（非 CURRENT_DATE），支援 D+10 日期篩選
- 刪除/編輯訂單時：先刪除對應 reference_note 的記錄，再重新計算
- 旋轉筒雙重扣減：cake_bar（口味）+ tube_pkg（包裝款式）

### RLS 政策

- 所有表啟用 Row Level Security
- 已認證用戶可讀寫所有資料（團隊內部工具）

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

## 檔案結構

```
packaging-calendar/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # 根 layout + AppShell
│   │   ├── page.tsx                # 重導到 /calendar
│   │   ├── login/page.tsx          # 登入/註冊
│   │   ├── calendar/
│   │   │   ├── page.tsx            # 月曆視圖 (Realtime)
│   │   │   └── [date]/page.tsx     # 日訂單管理 (CRUD+庫存+匯出+Realtime)
│   │   ├── search/page.tsx         # 客戶搜尋
│   │   ├── dashboard/page.tsx      # 統計儀表板 (Recharts, 5卡片+4圖表)
│   │   ├── inventory/page.tsx      # 產品庫存 (D+10+LINE叫貨+Realtime)
│   │   ├── materials/page.tsx      # 包材庫存 (CRUD+階層式用量對照+日期查詢)
│   │   ├── settings/page.tsx       # 設定 (CRUD)
│   │   └── api/
│   │       └── line-notify/route.ts # LINE 叫貨通知 API
│   ├── components/
│   │   ├── app-shell.tsx           # 側邊導航 + 頂部欄
│   │   └── ui/                     # shadcn/ui 元件 (20+, 基於 @base-ui/react)
│   ├── lib/
│   │   ├── supabase.ts             # 瀏覽器端 Supabase client
│   │   ├── supabase-server.ts      # 伺服器端 Supabase client
│   │   ├── types.ts                # TypeScript 型別定義
│   │   └── utils.ts                # 工具函數
│   └── middleware.ts               # Auth 保護路由
├── supabase/migrations/            # DB migration SQL (8 檔)
├── .env.local                      # Supabase URL + Key + LINE Token（不進 git）
└── package.json
```

## Git 提交歷史

```
xxxxxxx feat: 蜂蜜蛋糕(盒)新增單口味品項，修正庫存扣減邏輯
1c77fe4 refactor: 抽出 showMaterialWarnings helper，加註解釐清匹配邏輯
0f5ec8d feat: 訂單建立/編輯/刪除時自動扣減包材庫存
1cc69b2 feat: 包裝/烙印款式新增適用類別關聯，移除硬編碼
399192d feat: 用量對照改為階層式選擇 — 類別→口味→包裝→多種包材
0bde37f feat: 包材庫存支援編輯和刪除功能
a8676a7 feat: 統計儀表板新增旋轉筒出貨統計卡片與折線圖
9328243 feat: 旋轉筒庫存改為追蹤包裝款式，訂單保留口味名稱
d4fedaa fix: 旋轉筒保留口味名稱、單入蛋糕支援每口味獨立包裝款式
e43e92c feat: 旋轉筒改包裝款式名稱、曲奇排序調整、庫存歷史日期查詢
7336cae fix: 修復所有 Select 下拉選單顯示 UUID 代碼問題
fabf02b docs: 更新 LAD.md 反映所有已完成功能
9665e4f feat: 完成所有待辦功能 — 訂單編輯、庫存扣減、Recharts、CRUD、Realtime
5e753b8 fix: 統計和搜尋頁面移除舊的 packaging_id join
e5538f5 feat: 每個產品類別獨立包裝/烙印欄位
3af9427 fix: 烙印款式僅蛋糕有數量時可選，修復Select顯示UUID問題
a370061 feat: 更新產品結構和訂單管理
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
```

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
| Middleware 改為輕量 cookie 檢查 | `src/middleware.ts` | 省下每次切頁 ~200ms Supabase Auth 往返 |
| Browser client module-level singleton | `src/lib/supabase.ts` | 避免重複建立 GoTrueClient、減少記憶體 |
| 全域 `loading.tsx` 骨架屏 | `src/app/loading.tsx` | 切頁時立即顯示 spinner，消除白屏 |
| 拆分 Realtime 與 data fetch useEffect | `calendar/page.tsx`、`inventory/page.tsx` | Channel 只在 mount 時建一次，依賴變動不再重建 |
| 拆分 static data 只抓一次 | `calendar/[date]/page.tsx` | products/packaging/branding/usages 只在 mount 時抓，不隨日期重抓 |
| Date filter-bound realtime | `calendar/[date]/page.tsx` | Channel 隨 dateStr 重建但 ref 永遠指向最新 fetchOrders |
| `next.config.ts` 加優化 | `next.config.ts` | `optimizePackageImports` 涵蓋 @base-ui/react、recharts、lucide-react、date-fns；關 poweredByHeader；啟 compress |
| matcher 排除靜態資源 | `src/middleware.ts` | API/css/js/字型不再觸發 middleware |

### 預期效果

- 切頁視覺回饋：白屏 → 即時 spinner
- 後端延遲：每次切頁省下 200ms Auth 往返
- Realtime 握手：只在 mount 建立一次
- Bundle 大小：recharts / @base-ui 等套件按需載入

### 取捨說明

Middleware 的驗證從「呼叫 Supabase `getUser()` 驗證 JWT」改為「cookie 存在即放行」：
- 安全性由 Supabase RLS 在 DB 層把關（已啟用）
- 若 cookie 被 tamper，瀏覽器端 Supabase SDK 的 API 呼叫仍會失敗（401）
- 適用內部工具情境；若未來轉對外服務，須恢復 `getUser()`

## 已知限制

1. **middleware 警告** — Next.js 16 建議用 `proxy` 取代 `middleware`，功能正常但有警告
2. **Supabase email 確認** — 預設需要 email 確認，可在 Authentication > Providers > Email 關閉 "Confirm email"
3. **base-ui Select 顯示** — `@base-ui/react` 的 SelectValue 不會自動顯示 ItemText，需在 children 中手動解析 UUID → 名稱
4. **Realtime 需手動啟用** — 需在 Supabase Dashboard > Database > Publications 中將相關表加入 `supabase_realtime` publication

## 未完成事項

### 高優先

（目前無）

### 中優先

1. **Realtime 啟用** — 需在 Supabase Dashboard 手動啟用相關表的 Realtime（`orders`, `order_items`, `inventory`）

### 低優先

3. **middleware 遷移** — Next.js 16 建議將 `middleware.ts` 改為 `proxy` 模式
4. **自訂域名** — 可在 Vercel Dashboard > Domains 設定
5. **匯出格式擴充** — 目前僅支援 CSV，可考慮加入 PDF 列印排版

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
3. 將 `orders`、`order_items`、`inventory` 加入
4. 或直接在 SQL Editor 執行：
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory;
```
