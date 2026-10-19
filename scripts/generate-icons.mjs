// 앱 아이콘 생성: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

mkdirSync("public/icons", { recursive: true });

// 초록 바탕에 흰 십자가와 보고서 줄
const icon = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#2f5d50"/>
  <g fill="#ffffff">
    <rect x="232" y="104" width="48" height="232" rx="10"/>
    <rect x="164" y="164" width="184" height="48" rx="10"/>
    <rect x="152" y="370" width="208" height="20" rx="10" opacity="0.85"/>
    <rect x="184" y="404" width="144" height="20" rx="10" opacity="0.6"/>
  </g>
</svg>`;

// 알림 배지(안드로이드 상태 표시줄): 흰색 단색
const badge = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <g fill="#ffffff"><rect x="42" y="12" width="12" height="60" rx="3"/><rect x="24" y="28" width="48" height="12" rx="3"/></g>
</svg>`;

const out = [
  ["public/icons/icon-192.png", icon(false), 192],
  ["public/icons/icon-512.png", icon(false), 512],
  ["public/icons/icon-maskable-512.png", icon(true), 512],
  ["public/icons/apple-touch-icon.png", icon(true), 180],
  ["public/icons/badge-96.png", badge, 96],
];
for (const [file, svg, size] of out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  console.log(file);
}
