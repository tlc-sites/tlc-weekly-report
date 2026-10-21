import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TLC 교회 보고서",
    short_name: "TLC 교회 보고서",
    description: "교육부서, 예배팀, 캠퍼스 보고",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f4f0",
    theme_color: "#692d2d",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png?v=burgundy-report-20261021", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png?v=burgundy-report-20261021", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png?v=burgundy-report-20261021", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
