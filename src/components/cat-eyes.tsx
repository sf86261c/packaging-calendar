'use client'

import Image from 'next/image'
import { useEffect, useState, type CSSProperties } from 'react'

const ASPECT_RATIO = 664 / 622

const NOTE_GLYPHS = ['♪', '♫', '♬', '♩', '𝅘𝅥𝅮']

// 取自原圖的粉彩蠟筆色盤（窗框藍、貓臉米、耳朵棕、腮紅粉、鼻子棕等的同系飽和度）
const NOTE_COLORS = [
  '#7da4be', // 窗框藍
  '#c89283', // 耳朵棕粉
  '#d6a4a0', // 腮紅
  '#a18672', // 鼻子棕
  '#e0b46c', // 暖橘黃
  '#8aab9f', // 灰綠
  '#b59ac4', // 淡紫
]

const SPAWN_INTERVAL_MS = 1000

interface Note {
  id: number
  glyph: string
  startXPercent: number
  startYPercent: number
  swayPx: number
  rotateStart: number
  rotateEnd: number
  size: number
  color: string
  duration: number
  filterIndex: number // 0~3，輪流套用四種 turbulence seed 讓每個音符筆觸不同
}

interface SingingCatProps {
  size?: number
  className?: string
}

export function SingingCat({ size = 400, className }: SingingCatProps) {
  const [notes, setNotes] = useState<Note[]>([])

  useEffect(() => {
    let nextId = 0
    let cancelled = false

    const spawn = () => {
      if (cancelled) return
      const swayDir = Math.random() > 0.5 ? 1 : -1
      const note: Note = {
        id: nextId++,
        glyph: NOTE_GLYPHS[Math.floor(Math.random() * NOTE_GLYPHS.length)],
        startXPercent: 36 + Math.random() * 20,
        startYPercent: 40 + Math.random() * 6,
        swayPx: swayDir * (32 + Math.random() * 48),
        rotateStart: -18 + Math.random() * 36,
        rotateEnd: -45 + Math.random() * 90,
        size: (26 + Math.random() * 16) * (2 / 3),
        color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
        duration: 4200 + Math.random() * 1800,
        filterIndex: Math.floor(Math.random() * 4),
      }
      setNotes((prev) => [...prev, note])
      window.setTimeout(() => {
        if (cancelled) return
        setNotes((prev) => prev.filter((n) => n.id !== note.id))
      }, note.duration + 200)
    }

    spawn()
    const intervalId = window.setInterval(spawn, SPAWN_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size / ASPECT_RATIO,
        userSelect: 'none',
      }}
    >
      {/* 蠟筆筆觸用：四個不同 seed 的 turbulence 濾鏡，讓每個音符邊緣抖動方向不同 */}
      <svg
        width={0}
        height={0}
        style={{ position: 'absolute', pointerEvents: 'none' }}
        aria-hidden
      >
        <defs>
          {[1, 4, 7, 13].map((seed, i) => (
            <filter
              key={seed}
              id={`crayon-note-${i}`}
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.9"
                numOctaves="2"
                seed={seed}
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="2.2"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          ))}
        </defs>
      </svg>

      <Image
        src="/cat.png"
        alt="貓咪"
        width={664}
        height={622}
        priority
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
      />

      {notes.map((n) => (
        <span
          key={n.id}
          aria-hidden
          className="cat-note"
          style={{
            position: 'absolute',
            left: `${n.startXPercent}%`,
            top: `${n.startYPercent}%`,
            transform: 'translate(-50%, -50%)',
            fontFamily: '"Patrick Hand", "Caveat", "Comic Sans MS", "Microsoft JhengHei", cursive',
            fontSize: n.size,
            fontWeight: 700,
            lineHeight: 1,
            color: n.color,
            pointerEvents: 'none',
            textShadow:
              '0 0 1px rgba(255,255,255,0.9), 0 1px 0 rgba(255,255,255,0.6)',
            filter: `url(#crayon-note-${n.filterIndex}) blur(0.35px) saturate(0.92)`,
            animation: `cat-note-float ${n.duration}ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards`,
            willChange: 'transform, opacity',
            ['--sway' as string]: `${n.swayPx}px`,
            ['--rs' as string]: `${n.rotateStart}deg`,
            ['--re' as string]: `${n.rotateEnd}deg`,
          } as CSSProperties}
        >
          {n.glyph}
        </span>
      ))}
    </div>
  )
}

// 保留 CatEyes 別名以相容於先前匯入點
export const CatEyes = SingingCat
