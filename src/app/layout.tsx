import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "包裝行事曆",
  description: "蛋糕曲奇圓筒包裝排程管理系統",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className="font-sans antialiased" style={{ fontFamily: "'Microsoft JhengHei', sans-serif" }}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
