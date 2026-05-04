'use client'

import { SingingCat } from './cat-eyes'

const CAT_SIZE = 230

/**
 * AppShell 全域唱歌貓咪 widget（所有受保護頁面共用同一掛點）
 *
 * 位置設計（桌機 md 以上才顯示，手機隱藏）：
 * - 落在 sidebar 內（w-56 = 14rem 寬）「設定」下方、帳號區上方的空白區
 * - bottom 取 9rem - 36px：使貓咪底部離下方分線約 10px
 * - 高度設定為「設定」與「帳號區」之間，並預留 240px 音符飄升距離 → 音符不會覆蓋到「設定」
 * - 水平靠 sidebar 左側微留白
 * - position: fixed，故掛在 AppShell 任一處皆可，不依附 sidebar DOM
 */
export function DraggableCat() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-[calc(9rem-36px)] left-[calc(2.5rem-10px)] z-40 hidden md:block"
    >
      <SingingCat size={CAT_SIZE} />
    </div>
  )
}
