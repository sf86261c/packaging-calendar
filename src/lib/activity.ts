'use client'

import { createClient } from '@/lib/supabase'
import { getCurrentUserSync } from '@/lib/auth'

/**
 * 寫入操作紀錄。失敗只 console.warn，不影響主流程。
 *
 * @param action  操作描述（人類可讀，例如「訂單.新增」「設定.產品.停用」）
 * @param target  目標標識（例如 `order:abc-123`、`product:xyz`），可選
 * @param metadata 附加 JSON 資料（例如 { customer_name: '王小明' }），可選
 */
export async function logActivity(
  action: string,
  target?: string | null,
  metadata?: Record<string, unknown> | null,
): Promise<void> {
  const user = getCurrentUserSync()
  const username = user?.username ?? '訪客'
  try {
    const supabase = createClient()
    await supabase.rpc('log_activity', {
      p_username: username,
      p_action: action,
      p_target: target ?? null,
      p_metadata: metadata ?? null,
    })
  } catch (err) {
    console.warn('logActivity failed', err)
  }
}
