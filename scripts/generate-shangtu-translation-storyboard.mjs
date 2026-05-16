import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(repoRoot, "..");
const outputRoot = path.join(workspaceRoot, "shangtu_translation_video");
const framesDir = path.join(outputRoot, "frames");
const require = createRequire(import.meta.url);
const sharp = require(path.join(repoRoot, "node_modules/.pnpm/sharp@0.34.5/node_modules/sharp"));

const W = 1080;
const H = 1920;

const colors = {
  ink: "#17232b",
  muted: "#667680",
  teal: "#007f83",
  tealDark: "#005e63",
  tealSoft: "#dff4f2",
  amber: "#e49a3a",
  orange: "#eb6f3e",
  red: "#d94b45",
  cream: "#fbf7ef",
  card: "#ffffff",
  line: "#dce8e7",
  navy: "#18304d",
  green: "#0f9d80",
};

const font =
  '"PingFang SC, Hiragino Sans GB, Noto Sans CJK SC, Microsoft YaHei, Arial, sans-serif"';

const assets = {
  productBefore: path.join(repoRoot, "apps/web/public/images/auth-register-hero.png"),
  productCollage: path.join(workspaceRoot, "ppt_assets/shangtu_ai/slide_visual_01.png"),
  icon: path.join(repoRoot, "apps/extension/public/icons/icon-128.png"),
};

async function dataUri(file) {
  const ext = path.extname(file).slice(1).toLowerCase().replace("jpg", "jpeg");
  const data = await fs.readFile(file);
  return `data:image/${ext === "svg" ? "svg+xml" : ext};base64,${data.toString("base64")}`;
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function splitText(text, maxChars = 18) {
  const source = String(text);
  if (source.includes("\n")) return source.split("\n");
  const result = [];
  let current = "";
  for (const part of source.split(/(\s+)/u)) {
    if (!part.trim()) {
      current += part;
      continue;
    }
    if (/^[\x00-\x7F]+$/u.test(part)) {
      if ((current + part).length > maxChars && current.trim()) {
        result.push(current.trim());
        current = part;
      } else {
        current += part;
      }
      continue;
    }
    for (const ch of part) {
      if ((current + ch).length > maxChars && current.trim()) {
        result.push(current.trim());
        current = ch;
      } else {
        current += ch;
      }
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function textBlock({
  text,
  x,
  y,
  size = 42,
  weight = 600,
  fill = colors.ink,
  maxChars = 18,
  lineHeight = 1.18,
  anchor = "start",
  opacity = 1,
  letterSpacing = 0,
}) {
  const lines = splitText(text, maxChars);
  return `<text x="${x}" y="${y}" font-family=${font} font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}" letter-spacing="${letterSpacing}">${lines
    .map((line, i) => {
      const dy = i === 0 ? 0 : size * lineHeight;
      return `<tspan x="${x}" dy="${i === 0 ? 0 : dy}">${esc(line)}</tspan>`;
    })
    .join("")}</text>`;
}

function pill({ x, y, w, h, text, fill = colors.teal, color = "#fff", size = 28, weight = 700, stroke = "none" }) {
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${stroke}" />
    <text x="${x + w / 2}" y="${y + h / 2 + size * 0.36}" font-family=${font} font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="middle">${esc(
      text,
    )}</text>
  </g>`;
}

function card({ x, y, w, h, fill = "#fff", stroke = colors.line, radius = 28, opacity = 1, shadow = true }) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" opacity="${opacity}" ${
    shadow ? 'filter="url(#softShadow)"' : ""
  } />`;
}

function iconText({ x, y, icon, title, sub, color = colors.teal }) {
  return `<g>
    <circle cx="${x + 36}" cy="${y + 36}" r="36" fill="${color}" opacity="0.12"/>
    <text x="${x + 36}" y="${y + 47}" font-family=${font} font-size="34" font-weight="800" fill="${color}" text-anchor="middle">${esc(
      icon,
    )}</text>
    ${textBlock({ text: title, x: x + 92, y: y + 32, size: 30, weight: 800, maxChars: 12 })}
    ${textBlock({ text: sub, x: x + 92, y: y + 72, size: 22, weight: 500, fill: colors.muted, maxChars: 16 })}
  </g>`;
}

function brandLockup({ iconUri, x = 64, y = 64, small = false }) {
  const s = small ? 54 : 76;
  const titleSize = small ? 30 : 42;
  const subSize = small ? 18 : 22;
  return `<g>
    <image href="${iconUri}" x="${x}" y="${y}" width="${s}" height="${s}" rx="16"/>
    <text x="${x + s + 18}" y="${y + titleSize}" font-family=${font} font-size="${titleSize}" font-weight="900" fill="${colors.ink}">商图AI助手</text>
    <text x="${x + s + 20}" y="${y + titleSize + subSize + 10}" font-family=${font} font-size="${subSize}" font-weight="600" fill="${colors.teal}">商品图像智能助手</text>
  </g>`;
}

function defs() {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fbf8f1"/>
      <stop offset="0.46" stop-color="#f4fbfa"/>
      <stop offset="1" stop-color="#edf7fb"/>
    </linearGradient>
    <linearGradient id="tealGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#009c9b"/>
      <stop offset="1" stop-color="#005e63"/>
    </linearGradient>
    <linearGradient id="warmGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6b55b"/>
      <stop offset="1" stop-color="#eb6f3e"/>
    </linearGradient>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#14373a" flood-opacity="0.13"/>
    </filter>
    <filter id="hardShadow" x="-20%" y="-20%" width="150%" height="150%">
      <feDropShadow dx="0" dy="12" stdDeviation="9" flood-color="#142b2f" flood-opacity="0.22"/>
    </filter>
    <pattern id="dotGrid" width="42" height="42" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="2.2" fill="#b7d8d7" opacity="0.55"/>
    </pattern>
  </defs>`;
}

function bg() {
  return `<rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect x="-120" y="1320" width="1320" height="820" rx="420" fill="#d8f1ef" opacity="0.38"/>
    <rect x="580" y="-160" width="680" height="680" rx="340" fill="#ffe4be" opacity="0.34"/>
    <rect x="70" y="250" width="940" height="1280" fill="url(#dotGrid)" opacity="0.22"/>`;
}

function screenFrame({ x, y, w, h, title = "商图AI助手", content = "", footer = "" }) {
  return `<g>
    ${card({ x, y, w, h, fill: "#fdfefe", radius: 30 })}
    <rect x="${x}" y="${y}" width="${w}" height="82" rx="30" fill="#eef7f6"/>
    <circle cx="${x + 38}" cy="${y + 42}" r="10" fill="#eb6f3e"/>
    <circle cx="${x + 68}" cy="${y + 42}" r="10" fill="#e49a3a"/>
    <circle cx="${x + 98}" cy="${y + 42}" r="10" fill="#0f9d80"/>
    <text x="${x + 132}" y="${y + 52}" font-family=${font} font-size="26" font-weight="800" fill="${colors.tealDark}">${esc(
      title,
    )}</text>
    ${content}
    ${footer ? `<text x="${x + 34}" y="${y + h - 34}" font-family=${font} font-size="22" font-weight="600" fill="${colors.muted}">${esc(footer)}</text>` : ""}
  </g>`;
}

function productPoster({ x, y, w, h, title, sub, lang = "CN", accent = colors.teal, productUri, translated = false }) {
  return `<g>
    ${card({ x, y, w, h, fill: "#fff", radius: 26 })}
    <rect x="${x + 18}" y="${y + 18}" width="${w - 36}" height="${h - 36}" rx="20" fill="#f4f6ef"/>
    <image href="${productUri}" x="${x + 28}" y="${y + 36}" width="${w - 56}" height="${h * 0.46}" preserveAspectRatio="xMidYMid slice" opacity="0.96"/>
    ${pill({ x: x + 28, y: y + 28, w: 100, h: 42, text: lang, fill: translated ? colors.orange : colors.teal })}
    ${textBlock({ text: title, x: x + 36, y: y + h * 0.62, size: 30, weight: 900, fill: colors.ink, maxChars: 13, lineHeight: 1.12 })}
    ${textBlock({ text: sub, x: x + 36, y: y + h * 0.75, size: 21, weight: 600, fill: colors.muted, maxChars: 18, lineHeight: 1.22 })}
    <rect x="${x + 36}" y="${y + h - 78}" width="${w * 0.54}" height="38" rx="19" fill="${accent}" opacity="0.9"/>
    <text x="${x + 56}" y="${y + h - 52}" font-family=${font} font-size="18" font-weight="800" fill="#fff">${
      translated ? "Localized Selling Points" : "轻松随行 · 营养每一天"
    }</text>
  </g>`;
}

function progressRows({ x, y }) {
  return Array.from({ length: 5 }, (_, i) => {
    const yy = y + i * 118;
    const pct = [22, 41, 67, 84, 96][i];
    return `<g>
      <rect x="${x}" y="${yy}" width="680" height="86" rx="24" fill="#fff" stroke="${colors.line}"/>
      <rect x="${x + 22}" y="${yy + 20}" width="54" height="46" rx="14" fill="${i % 2 ? colors.tealSoft : "#fff1de"}"/>
      <text x="${x + 94}" y="${yy + 36}" font-family=${font} font-size="23" font-weight="800" fill="${colors.ink}">商品图_${String(i + 1).padStart(
        2,
        "0",
      )}.png</text>
      <text x="${x + 94}" y="${yy + 66}" font-family=${font} font-size="18" font-weight="600" fill="${colors.muted}">${pct < 90 ? "正在识别并翻译图片文字" : "生成结果中"}</text>
      <rect x="${x + 434}" y="${yy + 36}" width="190" height="14" rx="7" fill="#e8f0ef"/>
      <rect x="${x + 434}" y="${yy + 36}" width="${Math.round(190 * (pct / 100))}" height="14" rx="7" fill="${
        pct > 80 ? colors.green : colors.teal
      }"/>
      <text x="${x + 642}" y="${yy + 48}" font-family=${font} font-size="18" font-weight="800" fill="${colors.tealDark}" text-anchor="end">${pct}%</text>
    </g>`;
  }).join("");
}

function marketplaceMap({ x, y }) {
  const nodes = [
    ["Amazon", x + 108, y + 92, colors.navy],
    ["Shopee", x + 560, y + 128, colors.orange],
    ["TikTok Shop", x + 230, y + 380, "#111"],
    ["Lazada", x + 690, y + 438, "#603cc8"],
    ["独立站", x + 450, y + 620, colors.teal],
  ];
  return `<g>
    <path d="M${x + 140} ${y + 130} C ${x + 280} ${y + 280}, ${x + 420} ${y + 60}, ${x + 560} ${y + 128}" stroke="${colors.teal}" stroke-width="5" fill="none" opacity="0.35"/>
    <path d="M${x + 560} ${y + 128} C ${x + 610} ${y + 260}, ${x + 640} ${y + 340}, ${x + 690} ${y + 438}" stroke="${colors.orange}" stroke-width="5" fill="none" opacity="0.35"/>
    <path d="M${x + 230} ${y + 380} C ${x + 340} ${y + 450}, ${x + 360} ${y + 560}, ${x + 450} ${y + 620}" stroke="${colors.navy}" stroke-width="5" fill="none" opacity="0.28"/>
    ${nodes
      .map(
        ([name, nx, ny, color]) => `<g filter="url(#hardShadow)">
          <circle cx="${nx}" cy="${ny}" r="72" fill="#fff"/>
          <circle cx="${nx}" cy="${ny}" r="58" fill="${color}" opacity="0.12"/>
          <text x="${nx}" y="${ny + 8}" font-family=${font} font-size="25" font-weight="900" fill="${color}" text-anchor="middle">${esc(name)}</text>
        </g>`,
      )
      .join("")}
  </g>`;
}

async function buildSvg(frame, uris) {
  const { id, shot, phase } = frame;
  const common = `${defs()}${bg()}${brandLockup({ iconUri: uris.icon, small: true })}`;

  const byId = {
    "01-start": () => `${common}
      ${textBlock({ text: "明天要上架，商品图还是中文？", x: 64, y: 228, size: 70, weight: 950, maxChars: 12, lineHeight: 1.12 })}
      ${textBlock({ text: "跨境卖家最容易卡住的，不是选品，是图片本地化。", x: 68, y: 420, size: 31, weight: 600, fill: colors.muted, maxChars: 19 })}
      ${card({ x: 64, y: 540, w: 952, h: 250, fill: "#fff" })}
      ${textBlock({ text: "120 个 SKU", x: 108, y: 620, size: 62, weight: 950, fill: colors.orange, maxChars: 20 })}
      ${textBlock({ text: "详情页、卖点图、海报图都要翻译", x: 112, y: 708, size: 30, weight: 700, maxChars: 18 })}
      ${pill({ x: 620, y: 600, w: 132, h: 54, text: "Amazon", fill: colors.navy, size: 24 })}
      ${pill({ x: 766, y: 600, w: 134, h: 54, text: "Shopee", fill: colors.orange, size: 24 })}
      ${pill({ x: 620, y: 670, w: 172, h: 54, text: "TikTok Shop", fill: "#111", size: 22 })}
      ${pill({ x: 810, y: 670, w: 112, h: 54, text: "Lazada", fill: "#603cc8", size: 24 })}
      <g transform="translate(38 830) rotate(-2)">${productPoster({
        x: 48,
        y: 40,
        w: 430,
        h: 610,
        title: "鲜榨随行\n营养每一天",
        sub: "轻巧便携 随时随地享鲜榨",
        productUri: uris.productBefore,
      })}</g>
      <g transform="translate(520 860) rotate(2)">${productPoster({
        x: 0,
        y: 20,
        w: 456,
        h: 620,
        title: "卖点图还没翻译",
        sub: "英文、西语、法语、日语都要改版",
        productUri: uris.productBefore,
        accent: colors.red,
      })}</g>
      ${pill({ x: 96, y: 1654, w: 888, h: 96, text: "跨境上架前夜，图片别卡在翻译上", fill: colors.red, size: 33 })}`,

    "01-end": () => `${common}
      ${textBlock({ text: "逐张翻译，越改越乱。", x: 64, y: 246, size: 78, weight: 950, maxChars: 10, lineHeight: 1.05 })}
      ${card({ x: 66, y: 440, w: 948, h: 1010, fill: "#fff" })}
      ${iconText({ x: 112, y: 520, icon: "译", title: "翻译慢", sub: "一个语种一版图，批量上架被拖住", color: colors.red })}
      ${iconText({ x: 112, y: 700, icon: "版", title: "布局乱", sub: "德语/西语变长，文字压住商品", color: colors.orange })}
      ${iconText({ x: 112, y: 880, icon: "审", title: "校对难", sub: "卖点错译，平台图文不一致", color: colors.navy })}
      ${iconText({ x: 112, y: 1060, icon: "返", title: "返工多", sub: "美工来回改，运营等结果", color: colors.teal })}
      <rect x="180" y="1282" width="720" height="82" rx="41" fill="#fff1f1" stroke="#ffd1cf"/>
      <text x="540" y="1336" font-family=${font} font-size="33" font-weight="900" fill="${colors.red}" text-anchor="middle">问题不是不会翻，是太不适合批量做</text>
      ${pill({ x: 116, y: 1578, w: 848, h: 98, text: "用商图AI助手，把图片翻译变成一次点击", fill: "url(#tealGrad)", size: 32 })}`,

    "02-start": () => `${common}
      ${textBlock({ text: "老办法：翻译 + 美工 + 校对 + 重新导出", x: 64, y: 234, size: 62, weight: 950, maxChars: 12 })}
      ${textBlock({ text: "每多一个语种，就多一轮沟通和返工。", x: 68, y: 414, size: 30, weight: 600, fill: colors.muted, maxChars: 18 })}
      ${card({ x: 82, y: 540, w: 916, h: 870, fill: "#fff" })}
      ${["中文原图", "人工翻译", "找美工改图", "运营校对", "重新导出"].map((t, i) => {
        const y = 636 + i * 138;
        return `<g>
          <circle cx="170" cy="${y}" r="42" fill="${i === 0 ? colors.teal : colors.tealSoft}"/>
          <text x="170" y="${y + 11}" font-family=${font} font-size="30" font-weight="900" fill="${i === 0 ? "#fff" : colors.tealDark}" text-anchor="middle">${i + 1}</text>
          <text x="244" y="${y + 12}" font-family=${font} font-size="36" font-weight="850" fill="${colors.ink}">${esc(t)}</text>
          ${i < 4 ? `<path d="M170 ${y + 50} L170 ${y + 92}" stroke="${colors.teal}" stroke-width="5" stroke-linecap="round"/>` : ""}
        </g>`;
      }).join("")}
      <g transform="translate(570 996)">
        <circle cx="150" cy="150" r="142" fill="#fff8eb" stroke="#f5d6a4" stroke-width="3"/>
        <text x="150" y="130" font-family=${font} font-size="74" font-weight="950" fill="${colors.orange}" text-anchor="middle">2天</text>
        <text x="150" y="188" font-family=${font} font-size="26" font-weight="800" fill="${colors.muted}" text-anchor="middle">只是改一批图</text>
      </g>
      ${pill({ x: 146, y: 1586, w: 788, h: 88, text: "跨境团队需要的是：快、准、能批量", fill: colors.navy, size: 31 })}`,

    "02-end": () => `${common}
      ${textBlock({ text: "最怕翻完了，图不能直接用。", x: 64, y: 242, size: 68, weight: 950, maxChars: 11 })}
      ${card({ x: 74, y: 452, w: 932, h: 1000, fill: "#fff" })}
      ${[
        ["西语太长，压住卖点", 112, 560, colors.orange],
        ["英文标题生硬，不像本地品牌", 198, 752, colors.teal],
        ["法语换行错位，图片又要返工", 112, 946, colors.red],
        ["平台上架前，还在等美工导出", 208, 1142, colors.navy],
      ].map(([t, x, y, c], i) => `<g>
        <rect x="${x}" y="${y}" width="${760 - i * 24}" height="118" rx="32" fill="${i % 2 ? "#eff8f7" : "#fff7eb"}" stroke="${c}" opacity="0.96"/>
        <text x="${x + 38}" y="${y + 72}" font-family=${font} font-size="34" font-weight="900" fill="${c}">${esc(t)}</text>
      </g>`).join("")}
      <path d="M168 1386 C 348 1268, 650 1458, 858 1312" stroke="${colors.red}" stroke-width="12" fill="none" stroke-linecap="round" opacity="0.82"/>
      <text x="540" y="1544" font-family=${font} font-size="44" font-weight="950" fill="${colors.ink}" text-anchor="middle">图片翻译，应该直接服务上架</text>
      ${pill({ x: 156, y: 1640, w: 768, h: 92, text: "商图AI助手：翻译后就是可用素材", fill: "url(#tealGrad)", size: 31 })}`,

    "03-start": () => `${common}
      ${textBlock({ text: "打开商品页，右侧直接调出商图AI助手", x: 64, y: 230, size: 60, weight: 950, maxChars: 13 })}
      ${screenFrame({
        x: 72,
        y: 438,
        w: 936,
        h: 1020,
        title: "商品页 + 商图AI助手侧栏",
        content: `
          <rect x="118" y="560" width="506" height="700" rx="28" fill="#f4f7f6" stroke="${colors.line}"/>
          <image href="${uris.productBefore}" x="142" y="600" width="458" height="424" preserveAspectRatio="xMidYMid slice"/>
          <rect x="142" y="1064" width="360" height="34" rx="17" fill="#dfe9e8"/>
          <rect x="142" y="1120" width="300" height="26" rx="13" fill="#e9eeee"/>
          <rect x="142" y="1164" width="406" height="26" rx="13" fill="#e9eeee"/>
          <rect x="656" y="558" width="300" height="700" rx="28" fill="#fff" stroke="${colors.tealSoft}" stroke-width="3"/>
          <text x="700" y="628" font-family=${font} font-size="30" font-weight="900" fill="${colors.tealDark}">商图AI助手</text>
          ${["品类套图", "主图生成", "文字翻译", "营销海报"].map((t, i) => `<rect x="694" y="${690 + i * 102}" width="224" height="70" rx="22" fill="${i === 2 ? colors.teal : "#f2f7f6"}"/>
            <text x="806" y="${735 + i * 102}" font-family=${font} font-size="25" font-weight="850" fill="${i === 2 ? "#fff" : colors.ink}" text-anchor="middle">${t}</text>`).join("")}
          <rect x="694" y="1112" width="224" height="64" rx="22" fill="${colors.orange}"/>
          <text x="806" y="1153" font-family=${font} font-size="24" font-weight="900" fill="#fff" text-anchor="middle">读取当前页图片</text>
        `,
      })}
      ${pill({ x: 142, y: 1598, w: 796, h: 88, text: "商品页里直接开始处理图片", fill: colors.orange, size: 30 })}`,

    "03-end": () => `${common}
      ${textBlock({ text: "进入「文字翻译」，目标市场一次选好", x: 64, y: 228, size: 62, weight: 950, maxChars: 12 })}
      ${screenFrame({
        x: 90,
        y: 444,
        w: 900,
        h: 1034,
        title: "文字翻译",
        content: `
          <text x="144" y="586" font-family=${font} font-size="30" font-weight="900" fill="${colors.ink}">翻译设置</text>
          <text x="144" y="656" font-family=${font} font-size="24" font-weight="700" fill="${colors.muted}">目标语言</text>
          ${[
            ["English", 144, 694, colors.teal],
            ["Español", 350, 694, colors.orange],
            ["Français", 566, 694, colors.navy],
            ["Deutsch", 144, 772, colors.tealDark],
            ["日本語", 350, 772, colors.red],
          ].map(([t, x, y, c]) => pill({ x, y, w: 172, h: 52, text: t, fill: c, size: 22 })).join("")}
          <text x="144" y="910" font-family=${font} font-size="24" font-weight="700" fill="${colors.muted}">处理方式</text>
          <rect x="144" y="948" width="760" height="90" rx="28" fill="#eff8f7" stroke="${colors.teal}" stroke-width="3"/>
          <text x="184" y="1004" font-family=${font} font-size="29" font-weight="900" fill="${colors.tealDark}">保留原图版式，只替换图片文字</text>
          <rect x="144" y="1080" width="760" height="90" rx="28" fill="#fff7eb" stroke="#f5d6a4"/>
          <text x="184" y="1136" font-family=${font} font-size="29" font-weight="900" fill="${colors.orange}">可选二创：顺手做本地化卖点优化</text>
          <rect x="234" y="1290" width="612" height="82" rx="41" fill="url(#tealGrad)"/>
          <text x="540" y="1344" font-family=${font} font-size="31" font-weight="950" fill="#fff" text-anchor="middle">下一步：选择待翻译图片</text>
        `,
      })}
      ${pill({ x: 122, y: 1598, w: 836, h: 88, text: "目标语言一次选好", fill: colors.orange, size: 31 })}`,

    "04-start": () => `${common}
      ${textBlock({ text: "不用一张张下载，直接读取当前页商品图", x: 64, y: 226, size: 62, weight: 950, maxChars: 13 })}
      ${screenFrame({
        x: 70,
        y: 426,
        w: 940,
        h: 1070,
        title: "选择待翻译图片",
        content: `
          <text x="128" y="560" font-family=${font} font-size="28" font-weight="900" fill="${colors.ink}">待翻译图片候选</text>
          ${Array.from({ length: 9 }, (_, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const x = 128 + col * 274;
            const y = 620 + row * 230;
            return `<g>
              <rect x="${x}" y="${y}" width="230" height="184" rx="24" fill="#f4f7f6" stroke="${i < 5 ? colors.teal : colors.line}" stroke-width="${i < 5 ? 4 : 2}"/>
              <image href="${uris.productBefore}" x="${x + 12}" y="${y + 12}" width="206" height="120" preserveAspectRatio="xMidYMid slice" opacity="0.94"/>
              <rect x="${x + 22}" y="${y + 148}" width="112" height="16" rx="8" fill="${i < 5 ? colors.teal : "#dde7e6"}"/>
              ${i < 5 ? `<circle cx="${x + 202}" cy="${y + 34}" r="18" fill="${colors.teal}"/><text x="${x + 202}" y="${y + 43}" font-family=${font} font-size="22" font-weight="900" fill="#fff" text-anchor="middle">✓</text>` : ""}
            </g>`;
          }).join("")}
          <rect x="174" y="1338" width="732" height="72" rx="36" fill="${colors.orange}"/>
          <text x="540" y="1385" font-family=${font} font-size="29" font-weight="950" fill="#fff" text-anchor="middle">已选 12 张，可批量翻译</text>
        `,
      })}
      ${pill({ x: 126, y: 1610, w: 828, h: 88, text: "多张商品图，一次勾选", fill: colors.orange, size: 31 })}`,

    "04-end": () => `${common}
      ${textBlock({ text: "一批图，多个市场，同时准备。", x: 64, y: 236, size: 70, weight: 950, maxChars: 10 })}
      ${card({ x: 70, y: 438, w: 940, h: 1016, fill: "#fff" })}
      ${textBlock({ text: "目标市场", x: 126, y: 540, size: 34, weight: 900, maxChars: 20 })}
      ${[
        ["EN", "美国/英国站", 126, 604, colors.teal],
        ["ES", "西语市场", 126, 730, colors.orange],
        ["FR", "法国站", 126, 856, colors.navy],
        ["JP", "日本站", 126, 982, colors.red],
      ].map(([code, name, x, y, c]) => `<g>
        <rect x="${x}" y="${y}" width="828" height="92" rx="28" fill="${c}12" stroke="${c}" stroke-width="3"/>
        <rect x="${x + 24}" y="${y + 22}" width="72" height="48" rx="16" fill="${c}"/>
        <text x="${x + 60}" y="${y + 55}" font-family=${font} font-size="26" font-weight="950" fill="#fff" text-anchor="middle">${code}</text>
        <text x="${x + 124}" y="${y + 57}" font-family=${font} font-size="31" font-weight="900" fill="${colors.ink}">${name}</text>
        <text x="${x + 788}" y="${y + 57}" font-family=${font} font-size="26" font-weight="900" fill="${c}" text-anchor="end">已选择</text>
      </g>`).join("")}
      <rect x="174" y="1260" width="732" height="94" rx="47" fill="url(#tealGrad)"/>
      <text x="540" y="1322" font-family=${font} font-size="34" font-weight="950" fill="#fff" text-anchor="middle">开始翻译</text>
      ${pill({ x: 168, y: 1598, w: 744, h: 90, text: "商图AI助手：批量、多语种、少返工", fill: colors.navy, size: 31 })}`,

    "05-start": () => `${common}
      ${textBlock({ text: "核心不是翻字，是保住图片版式", x: 64, y: 230, size: 66, weight: 950, maxChars: 11 })}
      <g transform="translate(88 438)">${productPoster({
        x: 0,
        y: 0,
        w: 410,
        h: 690,
        title: "鲜榨随行\n营养每一天",
        sub: "轻巧便携 随时随地享鲜榨",
        productUri: uris.productBefore,
      })}</g>
      <g transform="translate(582 438)">${productPoster({
        x: 0,
        y: 0,
        w: 410,
        h: 690,
        title: "鲜榨随行\n营养每一天",
        sub: "轻巧便携 随时随地享鲜榨",
        productUri: uris.productBefore,
      })}</g>
      <path d="M512 720 L560 720" stroke="${colors.teal}" stroke-width="10" stroke-linecap="round"/>
      <path d="M548 692 L580 720 L548 748" stroke="${colors.teal}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      ${card({ x: 86, y: 1214, w: 908, h: 236, fill: "#fff" })}
      ${textBlock({ text: "识别图片中文字 → 判断卖点语境 → 保持原排版替换", x: 132, y: 1300, size: 36, weight: 900, maxChars: 18, lineHeight: 1.3 })}
      ${pill({ x: 146, y: 1594, w: 788, h: 90, text: "保留版式，只替换图片文字", fill: colors.orange, size: 30 })}`,

    "05-end": () => `${common}
      ${textBlock({ text: "中文图，秒变海外能看懂的卖点图", x: 64, y: 226, size: 64, weight: 950, maxChars: 13 })}
      <g transform="translate(54 410)">${productPoster({
        x: 0,
        y: 0,
        w: 310,
        h: 560,
        title: "鲜榨随行\n营养每一天",
        sub: "轻巧便携 随时随地享鲜榨",
        productUri: uris.productBefore,
      })}</g>
      <g transform="translate(386 410)">${productPoster({
        x: 0,
        y: 0,
        w: 310,
        h: 560,
        title: "Fresh Juice\nOn The Go",
        sub: "Portable, easy to clean, made for daily smoothies.",
        lang: "EN",
        productUri: uris.productBefore,
        translated: true,
        accent: colors.teal,
      })}</g>
      <g transform="translate(718 410)">${productPoster({
        x: 0,
        y: 0,
        w: 310,
        h: 560,
        title: "Zumo Fresco\nPara Llevar",
        sub: "Ligera, practica y lista para cada dia.",
        lang: "ES",
        productUri: uris.productBefore,
        translated: true,
        accent: colors.orange,
      })}</g>
      ${card({ x: 92, y: 1084, w: 896, h: 340, fill: "#fff" })}
      ${iconText({ x: 138, y: 1142, icon: "✓", title: "版式不乱", sub: "长短文字自动适配，商品主体不被遮挡", color: colors.teal })}
      ${iconText({ x: 138, y: 1272, icon: "✓", title: "语义更准", sub: "不是直译，而是按跨境卖点表达", color: colors.orange })}
      ${pill({ x: 124, y: 1594, w: 832, h: 92, text: "翻译、本地化、可上架，一次完成", fill: "url(#tealGrad)", size: 31 })}`,

    "06-start": () => `${common}
      ${textBlock({ text: "批量任务跑起来，运营不用盯着改图", x: 64, y: 230, size: 64, weight: 950, maxChars: 13 })}
      ${screenFrame({
        x: 72,
        y: 430,
        w: 936,
        h: 1048,
        title: "翻译任务队列",
        content: `
          <rect x="132" y="544" width="816" height="96" rx="30" fill="#eff8f7" stroke="${colors.tealSoft}"/>
          <text x="176" y="604" font-family=${font} font-size="32" font-weight="950" fill="${colors.tealDark}">已创建 1 个批量翻译任务</text>
          <text x="808" y="604" font-family=${font} font-size="28" font-weight="950" fill="${colors.orange}" text-anchor="end">12/12</text>
          ${progressRows({ x: 132, y: 700 })}
        `,
      })}
      ${pill({ x: 130, y: 1600, w: 820, h: 88, text: "批量任务自动推进", fill: colors.orange, size: 31 })}`,

    "06-end": () => `${common}
      ${textBlock({ text: "结果逐张返回，直接进素材库", x: 64, y: 238, size: 68, weight: 950, maxChars: 10 })}
      ${card({ x: 70, y: 430, w: 940, h: 1030, fill: "#fff" })}
      <text x="126" y="540" font-family=${font} font-size="33" font-weight="950" fill="${colors.ink}">翻译结果</text>
      ${Array.from({ length: 8 }, (_, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 126 + col * 418;
        const y = 594 + row * 178;
        const lang = ["EN", "ES", "FR", "JP"][i % 4];
        return `<g>
          <rect x="${x}" y="${y}" width="370" height="136" rx="24" fill="${i % 2 ? "#fff7eb" : "#eff8f7"}" stroke="${colors.line}"/>
          <image href="${uris.productBefore}" x="${x + 16}" y="${y + 16}" width="96" height="104" preserveAspectRatio="xMidYMid slice"/>
          <text x="${x + 132}" y="${y + 52}" font-family=${font} font-size="27" font-weight="900" fill="${colors.ink}">商品图 ${lang}</text>
          <text x="${x + 132}" y="${y + 90}" font-family=${font} font-size="21" font-weight="650" fill="${colors.muted}">已翻译 · 可下载</text>
          <circle cx="${x + 330}" cy="${y + 50}" r="22" fill="${colors.teal}"/>
          <text x="${x + 330}" y="${y + 59}" font-family=${font} font-size="23" font-weight="950" fill="#fff" text-anchor="middle">✓</text>
        </g>`;
      }).join("")}
      <rect x="170" y="1332" width="740" height="82" rx="41" fill="url(#warmGrad)"/>
      <text x="540" y="1387" font-family=${font} font-size="31" font-weight="950" fill="#fff" text-anchor="middle">打包下载 / 进入作品库</text>
      ${pill({ x: 142, y: 1598, w: 796, h: 90, text: "翻译结果逐张返回", fill: colors.orange, size: 31 })}`,

    "07-start": () => `${common}
      ${textBlock({ text: "一张中文商品图，走向多个海外市场", x: 64, y: 232, size: 64, weight: 950, maxChars: 13 })}
      ${card({ x: 72, y: 440, w: 936, h: 980, fill: "#fff" })}
      <g transform="translate(112 520)">${marketplaceMap({ x: 0, y: 0 })}</g>
      <g transform="translate(334 754) scale(0.82)">${productPoster({
        x: 0,
        y: 0,
        w: 360,
        h: 520,
        title: "Fresh Juice\nOn The Go",
        sub: "Localized listing image",
        lang: "GLOBAL",
        productUri: uris.productBefore,
        translated: true,
        accent: colors.teal,
      })}</g>
      ${pill({ x: 146, y: 1588, w: 788, h: 92, text: "图片语言跟着市场走，运营节奏不再等", fill: colors.navy, size: 30 })}`,

    "07-end": () => `${defs()}<rect width="${W}" height="${H}" fill="#f8fbfa"/>
      <image href="${uris.productCollage}" x="-840" y="168" width="2500" height="1406" preserveAspectRatio="xMidYMid slice" opacity="0.18"/>
      <rect width="${W}" height="${H}" fill="url(#bg)" opacity="0.78"/>
      <rect x="90" y="214" width="900" height="1330" rx="52" fill="#ffffff" filter="url(#softShadow)"/>
      <g transform="translate(0 102)">${brandLockup({ iconUri: uris.icon, x: 178, y: 244 })}</g>
      ${textBlock({ text: "商品图翻译", x: 540, y: 650, size: 86, weight: 950, fill: colors.ink, maxChars: 8, anchor: "middle" })}
      ${textBlock({ text: "一键本地化", x: 540, y: 760, size: 86, weight: 950, fill: colors.tealDark, maxChars: 8, anchor: "middle" })}
      ${textBlock({ text: "适合 Amazon / Shopee / TikTok Shop / 独立站的多语言图片素材", x: 540, y: 902, size: 31, weight: 650, fill: colors.muted, maxChars: 19, anchor: "middle", lineHeight: 1.28 })}
      <g transform="translate(144 1034)">
        ${pill({ x: 0, y: 0, w: 236, h: 72, text: "保留版式", fill: colors.teal, size: 27 })}
        ${pill({ x: 276, y: 0, w: 236, h: 72, text: "批量翻译", fill: colors.orange, size: 27 })}
        ${pill({ x: 552, y: 0, w: 236, h: 72, text: "多语种", fill: colors.navy, size: 27 })}
      </g>
      <rect x="170" y="1228" width="740" height="104" rx="52" fill="url(#tealGrad)"/>
      <text x="540" y="1296" font-family=${font} font-size="36" font-weight="950" fill="#fff" text-anchor="middle">跨境上架，更快一步</text>
      <text x="540" y="1466" font-family=${font} font-size="30" font-weight="900" fill="${colors.orange}" text-anchor="middle">认准商图AI助手</text>`,
  };

  const body = byId[id]();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${body}
  </svg>`;
}

const frames = [
  { id: "01-start", shot: "1", phase: "首帧" },
  { id: "01-end", shot: "1", phase: "尾帧" },
  { id: "02-start", shot: "2", phase: "首帧" },
  { id: "02-end", shot: "2", phase: "尾帧" },
  { id: "03-start", shot: "3", phase: "首帧" },
  { id: "03-end", shot: "3", phase: "尾帧" },
  { id: "04-start", shot: "4", phase: "首帧" },
  { id: "04-end", shot: "4", phase: "尾帧" },
  { id: "05-start", shot: "5", phase: "首帧" },
  { id: "05-end", shot: "5", phase: "尾帧" },
  { id: "06-start", shot: "6", phase: "首帧" },
  { id: "06-end", shot: "6", phase: "尾帧" },
  { id: "07-start", shot: "7", phase: "首帧" },
  { id: "07-end", shot: "7", phase: "尾帧" },
];

async function main() {
  await fs.mkdir(framesDir, { recursive: true });
  const uris = {
    productBefore: await dataUri(assets.productBefore),
    productCollage: await dataUri(assets.productCollage),
    icon: await dataUri(assets.icon),
  };

  const rendered = [];
  for (const frame of frames) {
    const svg = await buildSvg(frame, uris);
    const out = path.join(framesDir, `shot_${frame.id}.png`);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
    rendered.push(out);
  }

  const thumbs = await Promise.all(
    rendered.map(async (file, i) => ({
      input: await sharp(file).resize(180, 320).png().toBuffer(),
      top: Math.floor(i / 4) * 368,
      left: (i % 4) * 210,
    })),
  );
  const contact = sharp({
    create: {
      width: 840,
      height: Math.ceil(rendered.length / 4) * 368,
      channels: 4,
      background: "#f6faf9",
    },
  });
  await contact
    .composite(
      thumbs.flatMap((thumb, i) => [
        thumb,
        {
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="40"><text x="90" y="26" font-family=${font} font-size="18" font-weight="700" text-anchor="middle" fill="${colors.ink}">${esc(
              frames[i].id,
            )}</text></svg>`,
          ),
          left: thumb.left,
          top: thumb.top + 322,
        },
      ]),
    )
    .png()
    .toFile(path.join(outputRoot, "storyboard_contact_sheet.png"));

  console.log(`Rendered ${rendered.length} frames to ${framesDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
