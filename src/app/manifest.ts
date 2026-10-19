import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "교회 보고",
    short_name: "교회 보고",
    description: "교육부서, 예배팀, 캠퍼스 보고",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f9",
    theme_color: "#20365b",
    lang: "ko",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
