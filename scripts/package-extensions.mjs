import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, process.argv[2] || "downloads");
const extensionDir = resolve(rootDir, "apps/extension");
const extensionPackage = JSON.parse(readFileSync(resolve(extensionDir, "package.json"), "utf8"));
const version = extensionPackage.version || "0.0.0";

const targets = [
  {
    name: "dev",
    sourceDir: resolve(extensionDir, "dist-dev"),
    outputFile: resolve(outputDir, `kuajing-image-extension-dev-v${version}.zip`)
  },
  {
    name: "prod",
    sourceDir: resolve(extensionDir, "dist-prod"),
    outputFile: resolve(outputDir, `kuajing-image-extension-prod-v${version}.zip`)
  }
];

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let crc = i;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  crcTable[i] = crc >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateParts(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

function collectFiles(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      entries.push(...collectFiles(path));
    } else if (stats.isFile()) {
      entries.push(path);
    }
  }
  return entries;
}

function uint16(value) {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function createZip(sourceDir, outputFile) {
  const files = collectFiles(sourceDir);
  const localParts = [];
  const centralParts = [];
  const { date, time } = dosDateParts();
  let offset = 0;

  for (const file of files) {
    const relativePath = relative(sourceDir, file).split(sep).join("/");
    const nameBytes = Buffer.from(relativePath);
    const bytes = readFileSync(file);
    const crc = crc32(bytes);
    const localOffset = offset;

    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(time),
      uint16(date),
      uint32(crc),
      uint32(bytes.byteLength),
      uint32(bytes.byteLength),
      uint16(nameBytes.byteLength),
      uint16(0)
    ]);
    localParts.push(localHeader, nameBytes, bytes);
    offset += localHeader.byteLength + nameBytes.byteLength + bytes.byteLength;

    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(time),
      uint16(date),
      uint32(crc),
      uint32(bytes.byteLength),
      uint32(bytes.byteLength),
      uint16(nameBytes.byteLength),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(localOffset)
    ]);
    centralParts.push(centralHeader, nameBytes);
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((total, part) => total + part.byteLength, 0);
  const endRecord = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectorySize),
    uint32(centralDirectoryOffset),
    uint16(0)
  ]);

  writeFileSync(outputFile, Buffer.concat([...localParts, ...centralParts, endRecord]));
}

for (const target of targets) {
  createZip(target.sourceDir, target.outputFile);
  const displayPath = relative(rootDir, target.outputFile);
  console.log(`${target.name}: ${displayPath}`);
}
