// 驗證自助註冊已關閉（2026-07-28 業主裁決：帳號一律由管理員在 /settings 建立）。
//
// 兩個層次都要擋：
//   1. 前端：登入頁不得再有註冊 UI 或 signUp 呼叫
//   2. DB：sign_up RPC 不得再對 anon / authenticated 開放 EXECUTE
//      （只改前端擋不住直接打 REST API 的人，故 migration 035 必須執行）
//
// 執行：node scripts/verify-no-self-signup.mjs
// 需要 .env.local 才能做第 2 項線上檢查；沒有時只跑第 1 項並註明。

import { readFile } from 'node:fs/promises'

const failures = []
const notes = []

// ─── 1. 前端：登入頁不得殘留註冊路徑 ──────────────────────────────────
const loginSrc = await readFile(new URL('../src/app/login/page.tsx', import.meta.url), 'utf8')

const forbiddenInLogin = [
  ['signUp', 'signUp 函式仍被引用'],
  ['signup', "mode === 'signup' 之類的註冊分支仍在"],
  // 直接打 RPC 名稱也要攔——'sign_up' 既不含 'signUp' 也不含 'signup'，
  // 上面兩條攔不到 supabase.rpc('sign_up', …) 這種寫法。
  ['sign_up', "直接呼叫 sign_up RPC"],
  ['立即註冊', '「立即註冊」切換按鈕仍在'],
  ['註冊並登入', '「註冊並登入」按鈕文字仍在'],
]

for (const [needle, why] of forbiddenInLogin) {
  if (loginSrc.includes(needle)) {
    failures.push(`[前端] src/app/login/page.tsx 含「${needle}」→ ${why}`)
  }
}

// signUp() 本身也不該再存在於 auth.ts（會被打包進 client bundle 的死碼）
const authSrc = await readFile(new URL('../src/lib/auth.ts', import.meta.url), 'utf8')
if (authSrc.includes('export async function signUp')) {
  failures.push('[前端] src/lib/auth.ts 仍 export signUp() —— 無呼叫端的死碼，應移除')
}

// 反向確認：登入本身沒被誤刪
if (!loginSrc.includes('signIn')) {
  failures.push('[前端] src/app/login/page.tsx 找不到 signIn —— 登入功能被誤刪')
}

// ─── 2. DB：sign_up 不得對 anon 開放 ─────────────────────────────────
let env = null
try {
  env = Object.fromEntries(
    (await readFile(new URL('../.env.local', import.meta.url), 'utf8'))
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
      })
  )
} catch {
  notes.push('找不到 .env.local，跳過線上 RPC 檢查（只驗了前端）')
}

if (env?.NEXT_PUBLIC_SUPABASE_URL && env?.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // ⚠ 無條件零寫入探針：密碼故意給 3 個字元。
  //   031_app_users_permissions.sql 的檢查順序是
  //     帳號空值 → 密碼長度(<4 即 RAISE) → 帳號重複 → INSERT
  //   所以密碼長度檢查一定先於 INSERT 觸發，**不依賴任何帳號是否存在**，
  //   探針在任何情況下都不可能建立帳號。
  //   （早期版本改用「已存在的帳號名 admin」達成零寫入，但那是條件式的：
  //     admin 一旦被改名或刪除，同一支腳本就會在生產真的註冊一個帳號。）
  const res = await fetch(`${url}/rest/v1/rpc/sign_up`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_username: '__probe__', p_password: 'abc' }),
  })
  const body = await res.text()

  // 判定以 PostgreSQL error code 為準，不綁 HTTP status：
  // PostgREST 對 42501（insufficient_privilege）實測回 401，不是預期的 403。
  const permissionDenied = body.includes('42501') || body.includes('permission denied')

  if (permissionDenied || res.status === 404) {
    notes.push(
      `[DB] anon 呼叫 sign_up 被拒（HTTP ${res.status}，${res.status === 404 ? '函式不存在' : '42501 權限不足'}）✅ 權限已撤銷`
    )
  } else if (body.includes('密碼至少') || body.includes('已被使用')) {
    // 收到業務層的錯誤 = 呼叫確實進到函式體內 = GRANT 還在
    failures.push(
      `[DB] anon 仍可呼叫 sign_up（HTTP ${res.status}，回應為業務錯誤而非權限錯誤）` +
        ` → migration 035 尚未在 Supabase Dashboard 執行，任何人仍可直接打 REST API 註冊。`
    )
  } else {
    failures.push(
      `[DB] sign_up 探針回應無法判讀（HTTP ${res.status}）：${body.slice(0, 200)} —— 請人工確認權限狀態。`
    )
  }
} else if (env) {
  notes.push('.env.local 缺 SUPABASE URL/ANON KEY，跳過線上 RPC 檢查')
}

// ─── 輸出 ─────────────────────────────────────────────────────────────
for (const n of notes) console.log(`ℹ️  ${n}`)
if (failures.length > 0) {
  console.log('')
  for (const f of failures) console.log(`❌ ${f}`)
  console.log(`\n📊 ${failures.length} 項未通過`)
  // 用 exitCode 而非 process.exit()：Windows 上 process.exit() 會與尚未關閉的
  // fetch handle 相撞（libuv UV_HANDLE_CLOSING assertion），使 exit code 變成 127。
  // 代價是後續程式碼會繼續執行，所以成功訊息必須放在 else 分支。
  process.exitCode = 1
} else {
  console.log('\n✅ 自助註冊已關閉（前端無入口、anon 無法呼叫 sign_up）')
}
