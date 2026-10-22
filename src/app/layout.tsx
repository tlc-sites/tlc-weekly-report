import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AccountNotifications } from "@/components/account-notifications";
import Link from "next/link";
import { MenuIcon } from "@/components/menu-heading";
import {TranslationLanguage,LanguageSwitch} from "@/components/translation-language";
import {BottomNavigation} from "@/components/bottom-navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "TLC 교회 보고서",
  description: "교육부서, 예배팀, 캠퍼스 보고 시스템",
  // 아이폰은 홈 화면에 추가해야 알림을 받을 수 있다
  appleWebApp: { capable: true, title: "TLC 교회 보고서", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/favicon-32.png?v=burgundy-report-20261021", sizes: "32x32", type: "image/png" }], apple: "/icons/apple-touch-icon.png?v=burgundy-report-20261021" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#692d2d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full"><TranslationLanguage>
        <header data-print-hide className="border-b border-border/70 bg-background">
          <div className="mx-auto flex min-h-16 w-full max-w-2xl items-center gap-2 px-4 sm:px-5">
            <Link href="/" className="app-brand inline-flex min-w-0 flex-1 items-center gap-2 text-sm sm:text-base text-accent">
              <span className="shrink-0"><MenuIcon name="report" small /></span><span className="min-w-0 break-keep">TLC 교회 보고서</span>
            </Link><LanguageSwitch/><Suspense fallback={null}><AccountNotifications /></Suspense>
          </div>
        </header>
        <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-2xl min-w-0 flex-col px-4 py-6 sm:px-5 sm:py-7">{children}</main>
        <Suspense fallback={null}><BottomNavigation/></Suspense>
      </TranslationLanguage></body>
    </html>
  );
}
