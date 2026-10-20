// 공개 원본 TTF를 WOFF 1.0으로 무손실 압축한다. 글리프와 이름은 변경하지 않는다.
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

for (const filename of process.argv.slice(2)) {
  const source = readFileSync(filename);
  const count = source.readUInt16BE(4);
  const header = Buffer.alloc(44 + count * 20);
  header.write("wOFF");
  header.writeUInt32BE(source.readUInt32BE(0), 4);
  header.writeUInt16BE(count, 12);
  header.writeUInt16BE(1, 20);
  let offset = header.length;
  let sfntSize = 12 + count * 16;
  const tables = [];
  for (let i = 0; i < count; i++) {
    const entry = 12 + i * 16;
    const length = source.readUInt32BE(entry + 12);
    const start = source.readUInt32BE(entry + 8);
    const raw = source.subarray(start, start + length);
    const compressed = deflateSync(raw);
    const data = compressed.length < raw.length ? compressed : raw;
    const directory = 44 + i * 20;
    source.copy(header, directory, entry, entry + 4);
    header.writeUInt32BE(offset, directory + 4);
    header.writeUInt32BE(data.length, directory + 8);
    header.writeUInt32BE(raw.length, directory + 12);
    header.writeUInt32BE(source.readUInt32BE(entry + 4), directory + 16);
    const padded = Buffer.alloc(Math.ceil(data.length / 4) * 4);
    data.copy(padded);
    tables.push(padded);
    offset += padded.length;
    sfntSize += Math.ceil(raw.length / 4) * 4;
  }
  header.writeUInt32BE(offset, 8);
  header.writeUInt32BE(sfntSize, 16);
  writeFileSync(filename.replace(/\.ttf$/, ".woff"), Buffer.concat([header, ...tables]));
}
