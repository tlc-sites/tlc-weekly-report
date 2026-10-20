import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { MenuIcon } from "@/components/menu-heading";
import "./globals.css";

export const metadata: Metadata = {
  title: "TLC 교회 보고서",
  description: "교육부서, 예배팀, 캠퍼스 보고 시스템",
  // 아이폰은 홈 화면에 추가해야 알림을 받을 수 있다
  appleWebApp: { capable: true, title: "TLC 교회 보고서", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/favicon-32.png?v=weekly-report-1", sizes: "32x32", type: "image/png" }], apple: "/icons/apple-touch-icon.png?v=weekly-report-1" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#20365b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        <header data-print-hide className="border-b border-border/70 bg-background">
          <div className="mx-auto flex min-h-16 w-full max-w-2xl items-center px-4 sm:px-5">
            <Link href="/" className="app-brand inline-flex items-center gap-2.5 text-base text-accent">
              <MenuIcon name="report" small />TLC 교회 보고서
            </Link>
          </div>
        </header>
        <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-2xl flex-col px-4 py-6 sm:px-5 sm:py-7">{children}</main>
      </body>
    </html>
  );
}
