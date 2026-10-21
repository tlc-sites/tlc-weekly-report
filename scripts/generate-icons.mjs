// 앱 아이콘 생성: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("public/icons", { recursive: true });

// 사용자가 제공한 원본을 그대로 축소한다. Maskable은 안전 영역에 여백을 둔다.
const source = "public/icons/weekly-report.png";

// 알림 배지(안드로이드 상태 표시줄): 흰색 단색
const badge = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <g fill="#ffffff"><rect x="42" y="12" width="12" height="60" rx="3"/><rect x="24" y="28" width="48" height="12" rx="3"/></g>
</svg>`;

const out = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/apple-touch-icon.png", 180],
  ["public/icons/favicon-32.png", 32],
];
for (const [file, size] of out) {
  await sharp(source).resize(size, size).png().toFile(file);
  console.log(file);
}
await sharp(source).resize(400, 400).flatten({ background: "#692d2d" })
  .extend({ top: 56, bottom: 56, left: 56, right: 56, background: "#692d2d" })
  .png().toFile("public/icons/icon-maskable-512.png");
await sharp(Buffer.from(badge)).resize(96, 96).png().toFile("public/icons/badge-96.png");

// ICO 컨테이너에 16/32/48px PNG를 담아 브라우저별 탭 아이콘에 대응한다.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(source).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((png, i) => {
  const entry = 6 + i * 16;
  header[entry] = sizes[i];
  header[entry + 1] = sizes[i];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...images]));
