import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AccountNotifications } from "@/components/account-notifications";
import Link from "@/components/pending-link";
import {TranslationLanguage,LanguageSwitch} from "@/components/translation-language";
import {BottomNavigation} from "@/components/bottom-navigation";
import {DesktopSidebar} from "@/components/desktop-sidebar";
import {NotificationSeen} from "@/components/notification-seen";
import {THEME_SCRIPT} from "@/components/theme-switch";
import "./globals.css";
import "./fonts-serif.css";

export const metadata: Metadata = {
  title: "TLC 교회 보고서",
  description: "교회학교, 예배팀, 캠퍼스 보고 시스템",
  // 아이폰은 홈 화면에 추가해야 알림을 받을 수 있다
  appleWebApp: { capable: true, title: "TLC 교회 보고서", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/favicon-32.png?v=burgundy-report-20261021", sizes: "32x32", type: "image/png" }], apple: "/icons/apple-touch-icon.png?v=burgundy-report-20261021" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6b2c2c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body className="min-h-full"><TranslationLanguage>
        <Suspense fallback={null}><DesktopSidebar/></Suspense>
        <Suspense fallback={null}><NotificationSeen/></Suspense>
        <header data-print-hide className="app-header">
          <div className="mx-auto flex min-h-16 w-full max-w-2xl items-center gap-2 px-4 sm:px-5">
            {/* 교회 로고(앱 아이콘에서 뽑은 원본, 흰색) */}
            <Link href="/" className="app-brand inline-flex min-w-0 flex-1 items-center gap-2.5" aria-label="TLC 교회 보고서 홈">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/church-logo-white.png" alt="" width={40} height={36} className="app-brand-mark" />
              <span className="app-brand-name"><b>교회 보고서</b><small>THE LORD&apos;S CHURCH</small></span>
            </Link><span className="app-header-tools flex shrink-0 items-center"><LanguageSwitch/><Suspense fallback={null}><AccountNotifications /></Suspense></span>
          </div>
        </header>
        <main className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-2xl min-w-0 flex-col px-4 py-6 sm:px-5 sm:py-7">{children}</main>
        <Suspense fallback={null}><BottomNavigation/></Suspense>
      </TranslationLanguage></body>
    </html>
  );
}
