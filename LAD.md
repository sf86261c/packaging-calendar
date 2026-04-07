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
| UI | Tailwind CSS 4 + shadcn/ui |
| 資料庫 | Supabase (PostgreSQL) + RLS |
| 認證 | Supabase Auth (email/password) |
| 部署 | Vercel (Hobby plan, 自動 CI/CD) |
| 圖表 | Recharts 3.8（已整合） |
| 即時同步 | Supabase Realtime |

## 功能清單

### 頁面

| 頁面 | 路由 | 狀態 | 說明 |
|------|------|------|------|
| 登入/註冊 | `/login` | ✅ 完成 | Supabase Auth，支援 email/password |
| 月曆視圖 | `/calendar` | ✅ 完成 | 月份切換、每日訂單摘要、Realtime 同步 |
| 日訂單管理 | `/calendar/[date]` | ✅ 完成 | 新增/編輯/刪除訂單、庫存自動扣減、CSV匯出、Realtime |
| 客戶搜尋 | `/search` | ✅ 完成 | 即時搜尋(ilike)、點擊跳轉日期頁 |
| 統計儀表板 | `/dashboard` | ✅ 完成 | Recharts 長條圖/圓餅圖/折線圖/面積圖 |
| 產品庫存 | `/inventory` | ✅ 完成 | 蛋糕(條)/曲奇/圓筒庫存量、入庫、Realtime |
| 包材庫存 | `/materials` | ✅ 完成 | 包材 CRUD、入庫、產品用量對照表 |
| 設定 | `/settings` | ✅ 完成 | 產品/包裝/烙印的新增、編輯、停用 CRUD |

### 產品結構

| 類別 | category | 品項 | 庫存換算 |
|------|----------|------|---------|
| 蜂蜜蛋糕（盒） | `cake` | 經典原味+伯爵紅茶、經典原味+茉莉花茶、伯爵紅茶+茉莉花茶 | 1盒 = 2條 cake_bar |
| 蛋糕原料（條） | `cake_bar` | 經典原味（條）、伯爵紅茶（條）、茉莉花茶（條） | 庫存追蹤單位 |
| 旋轉筒 | `tube` | 旋轉筒-經典原味、旋轉筒-伯爵紅茶、旋轉筒-茉莉花茶 | 1筒 = 1條 cake_bar |
| 單入蛋糕 | `single_cake` | 單入-經典原味、單入-伯爵紅茶、單入-茉莉花茶 | 1個 = 0.25條 cake_bar |
| 曲奇 | `cookie` | 原味白、可可粉、伯爵藍、綜合白、綜合粉、綜合藍 | 獨立計算 |

### 包裝/烙印規則

| 類別 | 包裝款式 | 烙印款式 |
|------|---------|---------|
| 蜂蜜蛋糕 | 下拉：祝福緞帶(米)、森林旋律(粉)、歡樂派對(藍) | 下拉：甜蜜樂章、慶祝派對、馬年限定 |
| 旋轉筒 | 下拉：四季童話、銀河探險、旋轉木馬 | 無 |
| 單入蛋糕 | 下拉：愛心、花園、小熊 | **自由輸入框**（非下拉） |
| 曲奇 | 無 | 無 |

- 烙印款式整個區塊：**僅蜂蜜蛋糕有填數量時才啟用**
- 包裝/烙印欄位：**填了數量後才動態顯示**
- 一張訂單可**同時包含多種類別**

### 訂單功能

- **新增/編輯/刪除**：完整 CRUD（點擊筆圖示編輯、垃圾桶刪除）
- **庫存自動扣減**：新增訂單自動從 cake_bar 庫存扣減；刪除/編輯自動回沖
- **CSV 匯出**：日訂單頁面可下載 CSV 檔案
- **狀態欄**：自由輸入框（非下拉）
- **列印勾選**：左側 checkbox，勾選後整列背景變黃色

### Realtime 同步

- `/calendar`、`/calendar/[date]`、`/inventory` 已啟用 Supabase Realtime
- 多人同時操作時自動刷新，無需手動重整

### 統計儀表板（Recharts）

| 圖表 | 類型 | 資料來源 |
|------|------|---------|
| 包裝款式統計 | BarChart（水平長條） | orders → packaging_styles |
| 曲奇銷量分析 | PieChart（圓餅） | order_items → cookie products |
| 每日出貨趨勢 | LineChart（折線） | order_items 按日期分組 |
| 每日訂單量 | AreaChart（面積） | orders 按日期分組 |

### 設定頁面 CRUD

- 產品管理：按 category 分組，支援新增/編輯名稱/停用
- 包裝款式管理：新增/編輯/停用，支援色碼設定
- 烙印款式管理：新增/編輯/停用

### 包材庫存

- 包材品項 CRUD（名稱、單位、安全庫存）
- 入庫紀錄管理
- 產品 → 包材用量對照表
- 低庫存警示

## 資料庫 Schema

### 核心表

```
products         — 產品主檔 (category, name, sort_order, is_active)
packaging_styles — 包裝款式 (name, color_code, is_active)
branding_styles  — 烙印款式 (name, is_active)
orders           — 訂單 (order_date, customer_name, status, batch_info, printed,
                    cake_packaging_id, cake_branding_id,
                    tube_packaging_id,
                    single_cake_packaging_id, single_cake_branding_text)
order_items      — 訂單品項 (order_id, product_id, quantity)
inventory        — 庫存紀錄 (product_id, date, type, quantity, reference_note)
```

### 包材相關表

```
packaging_materials          — 包材主檔 (name, unit, safety_stock)
packaging_material_inventory — 包材庫存紀錄
product_material_usage       — 產品→包材用量對照
```

### 庫存扣減機制

- 訂單建立時：根據品項自動插入 `inventory` 記錄（type='outbound', quantity=負數）
- `reference_note` 格式：`order:{orderId}`
- 刪除/編輯訂單時：先刪除對應 reference_note 的記錄，再重新計算

### RLS 政策

- 所有表啟用 Row Level Security
- 已認證用戶可讀寫所有資料（團隊內部工具）

### Migrations

| 檔案 | 內容 |
|------|------|
| `001_initial_schema.sql` | 建表、索引、seed data、RLS、trigger |
| `002_update_products.sql` | 新產品結構、新烙印/包裝、printed 欄位 |
| `003_per_category_packaging.sql` | 每類別獨立 packaging/branding 欄位 |

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
│   │   ├── dashboard/page.tsx      # 統計儀表板 (Recharts)
│   │   ├── inventory/page.tsx      # 產品庫存 (Realtime)
│   │   ├── materials/page.tsx      # 包材庫存 (CRUD)
│   │   └── settings/page.tsx       # 設定 (CRUD)
│   ├── components/
│   │   ├── app-shell.tsx           # 側邊導航 + 頂部欄
│   │   └── ui/                     # shadcn/ui 元件 (20+)
│   ├── lib/
│   │   ├── supabase.ts             # 瀏覽器端 Supabase client
│   │   ├── supabase-server.ts      # 伺服器端 Supabase client
│   │   ├── types.ts                # TypeScript 型別定義
│   │   └── utils.ts                # 工具函數
│   └── middleware.ts               # Auth 保護路由
├── supabase/migrations/            # DB migration SQL (3 檔)
├── .env.local                      # Supabase URL + Key（不進 git）
└── package.json
```

## Git 提交歷史

```
9665e4f feat: 完成所有待辦功能 — 訂單編輯、庫存扣減、Recharts、CRUD、Realtime
5e753b8 fix: 統計和搜尋頁面移除舊的 packaging_id join
e5538f5 feat: 每個產品類別獨立包裝/烙印欄位
3af9427 fix: 烙印款式僅蛋糕有數量時可選，修復Select顯示UUID問題
a370061 feat: 更新產品結構和訂單管理
082a870 feat: 包裝行事曆 Web 應用初始版本
```

## 已知限制

1. **middleware 警告** — Next.js 16 建議用 `proxy` 取代 `middleware`，功能正常但有警告
2. **Supabase email 確認** — 預設需要 email 確認，可在 Authentication > Providers > Email 關閉 "Confirm email"
3. **Supabase Realtime** — 需在 Supabase Dashboard > Database > Replication 中啟用相關表的 Realtime 功能
4. **包材庫存** — 框架完成但尚無 seed data，需透過 UI 新增包材品項和用量對照

## 環境資訊

- **Supabase URL**: `https://zgkvmbaxbksxjckzkths.supabase.co`
- **Supabase Anon Key**: `sb_publishable_w_wFOJOqx1JzcfMgJYo1uw_3X6LcjLZ`
- **Vercel Team**: sf86261cs-projects
- **GitHub User**: sf86261c
- **Node.js**: v24.14.0
- **Next.js**: 16.2.2

## 部署流程

1. 修改程式碼
2. `git add -A && git commit -m "..." && git push`
3. Vercel 自動偵測 push → 建置 → 部署（1-2 分鐘）
4. 若有 DB schema 變更，需手動到 Supabase Dashboard > SQL Editor 執行 migration SQL

## Realtime 啟用步驟

若 Realtime 功能無法運作，需在 Supabase Dashboard 中：
1. 前往 Database > Replication
2. 啟用 `orders`、`order_items`、`inventory` 表的 Realtime
3. 確認 RLS 政策允許 authenticated 用戶讀取
