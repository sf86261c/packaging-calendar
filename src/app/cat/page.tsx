'use client'

import { SingingCat } from '@/components/cat-eyes'

export default function CatPage() {
  return (
    <div className="relative -m-4 flex min-h-[calc(100vh-2rem)] flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-sky-50 via-amber-50 to-rose-50 md:-m-6 md:min-h-[calc(100vh-3rem)]">
      <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle_at_20%_20%,rgba(186,230,253,0.45),transparent_55%),radial-gradient(circle_at_80%_75%,rgba(254,205,211,0.35),transparent_55%)]" />

      <header className="relative z-10 mt-4 mb-2 text-center md:mt-2">
        <h1 className="text-3xl font-bold tracking-wide text-foreground md:text-4xl">
          ♪ 貓咪正在唱歌 ♫
        </h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          看那些音符飄上天 ✨
        </p>
      </header>

      <div className="relative z-10 flex w-full flex-1 items-center justify-center px-4 pb-8">
        <SingingCat size={520} className="drop-shadow-[0_24px_50px_rgba(15,23,42,0.18)]" />
      </div>
    </div>
  )
}
