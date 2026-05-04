import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, join, relative, resolve, sep } from "node:path";

const rootDir = resolve(import.meta.dirname, "..");
const outputDir = resolve(rootDir, process.argv[2] || "downloads");
const requestedTarget = process.argv[3] || "all";
const extensionDir = resolve(rootDir, "apps/extension");
const extensionPackage = JSON.parse(readFileSync(resolve(extensionDir, "package.json"), "utf8"));
const version = extensionPackage.version || "0.0.0";
const publishedAt = new Date().toISOString();
const releaseNotes = (process.env.EXTENSION_RELEASE_NOTES || "")
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean);

mkdirSync(outputDir, { recursive: true });

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

if (!["all", "dev", "prod"].includes(requestedTarget)) {
  console.error("Usage: node scripts/package-extensions.mjs [outputDir] [all|dev|prod]");
  process.exit(1);
}

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

for (const target of targets.filter((target) => requestedTarget === "all" || target.name === requestedTarget)) {
  createZip(target.sourceDir, target.outputFile);
  const latestZipFile = resolve(outputDir, `kuajing-image-extension-${target.name}-latest.zip`);
  copyFileSync(target.outputFile, latestZipFile);
  const bytes = readFileSync(target.outputFile);
  const latestManifest = {
    target: target.name,
    version,
    publishedAt,
    downloadUrl: `/downloads/${basename(target.outputFile)}`,
    latestDownloadUrl: `/downloads/${basename(latestZipFile)}`,
    installHelpUrl: "/install-help.html",
    fileName: basename(target.outputFile),
    sizeBytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    releaseNotes: releaseNotes.length > 0 ? releaseNotes : ["优化插件体验并修复已知问题。"]
  };
  writeFileSync(resolve(outputDir, `kuajing-image-extension-${target.name}-latest.json`), `${JSON.stringify(latestManifest, null, 2)}\n`);
  const displayPath = relative(rootDir, target.outputFile);
  console.log(`${target.name}: ${displayPath}`);
}
