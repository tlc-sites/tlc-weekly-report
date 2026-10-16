import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "교회 보고",
  description: "교육부서, 예배팀, 캠퍼스 보고 시스템",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
