'use client'

import { SingingCat } from './cat-eyes'

const CAT_SIZE = 180

/**
 * 月曆頁 sidebar 內的唱歌貓咪 widget
 *
 * 位置設計（桌機 md 以上才顯示，手機隱藏）：
 * - 落在 sidebar 內（w-56 = 14rem 寬）「設定」下方、帳號區上方的空白區
 * - 高度設定為「設定」與「帳號區」之間，並預留 240px 音符飄升距離 → 音符不會覆蓋到「設定」
 * - 水平靠 sidebar 左側微留白
 */
export function DraggableCat() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-36 left-10 z-40 hidden md:block"
    >
      <SingingCat size={CAT_SIZE} />
    </div>
  )
}
