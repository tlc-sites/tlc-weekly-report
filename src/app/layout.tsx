import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "교회 보고",
  description: "교육부서, 예배팀, 캠퍼스 보고 시스템",
  // 아이폰은 홈 화면에 추가해야 알림을 받을 수 있다
  appleWebApp: { capable: true, title: "교회 보고", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f5d50",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
