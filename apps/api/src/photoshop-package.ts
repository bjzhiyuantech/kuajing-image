import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { basename, resolve } from "node:path";
import sharp from "sharp";
import type { RequestTenant } from "./auth-context.js";
import { readStoredAsset } from "./image-generation.js";
import { runtimePaths } from "./runtime.js";

const photoshopPackagesDir = resolve(runtimePaths.dataDir, "photoshop-packages");
const manifestFileName = "manifest.json";
const compositeLayerFileName = "ai-composite.png";
const productLayerFileName = "product.png";
const backgroundLayerFileName = "background.png";
const textArtworkLayerFileName = "text-artwork.png";
const colorClusterLayerCount = 8;

export interface PhotoshopPackageCreateInput {
  assetId: string;
  baseUrl: string;
  packageName?: string;
}

export interface PhotoshopPackageCreateResponse {
  packageId: string;
  manifestUrl: string;
  expiresAt: string;
  manifest: PhotoshopPackageManifest;
}

export interface PhotoshopPackageManifest {
  version: 1;
  packageId: string;
  sourceAssetId: string;
  name: string;
  canvas: {
    width: number;
    height: number;
  };
  recommendedDocumentName: string;
  tokenExpiresAt: string;
  workflow: {
    kind: "photoshop-mvp";
    layerStrategy: "alpha-channel" | "edge-background" | "design-elements" | "color-clusters" | "flat";
    notes: string[];
  };
  source: {
    fileName: string;
    mimeType: string;
    width: number;
    height: number;
    url: string;
  };
  psd: {
    fileName: string;
    url: string;
  };
  layers: PhotoshopPackageLayer[];
}

export interface PhotoshopPackageLayer {
  id: string;
  name: string;
  kind: "pixel";
  role: "composite" | "subject" | "background" | "text" | "artwork" | "color";
  visible: boolean;
  opacity: number;
  blendMode: "normal";
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  fileName: string;
  url: string;
  importHint: string;
}

interface PsdLayerInput {
  name: string;
  image: Buffer;
  width: number;
  height: number;
  visible?: boolean;
}

interface MvpPackageLayer {
  id: string;
  name: string;
  role: PhotoshopPackageLayer["role"];
  fileName: string;
  image: Buffer;
  importHint: string;
  visible?: boolean;
}

interface PhotoshopPackageFile {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
}

interface StoredPackageMetadata {
  packageId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  tenant: RequestTenant;
  sourceAssetId: string;
  files: Record<string, {
    fileName: string;
    mimeType: string;
  }>;
}

export async function createPhotoshopPackage(
  tenant: RequestTenant,
  input: PhotoshopPackageCreateInput
): Promise<PhotoshopPackageCreateResponse> {
  const asset = await readStoredAsset(tenant, input.assetId);
  if (!asset) {
    throw new PhotoshopPackageError("not_found", "找不到请求的图像资源。", 404);
  }
  if (!asset.file.mimeType.startsWith("image/")) {
    throw new PhotoshopPackageError("invalid_asset", "Photoshop 工作流只支持图像资源。", 400);
  }

  const normalized = await sharp(asset.bytes).rotate().png().toBuffer();
  const metadata = await sharp(normalized).metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new PhotoshopPackageError("invalid_asset", "图像尺寸无法识别。", 400);
  }

  const packageId = randomPackageId();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  await mkdir(photoshopPackagesDir, { recursive: true });
  const packageDir = resolvePackagePath(packageId);
  await mkdir(packageDir, { recursive: true });

  const packageName = packageNameFromInput(input.packageName, input.assetId);
  const psdFileName = `${packageName}.psd`;
  const mvpLayers = await createMvpLayers(normalized, Number(width), Number(height));
  const psdBytes = await createLayeredPsd({
    width: Number(width),
    height: Number(height),
    layers: mvpLayers.layers.map((layer) => ({
      name: layer.name,
      image: layer.image,
      width: Number(width),
      height: Number(height),
      visible: layer.visible
    }))
  });
  const files: Record<string, PhotoshopPackageFile> = {
    ...Object.fromEntries(mvpLayers.layers.map((layer) => [layer.fileName, {
      bytes: layer.image,
      mimeType: "image/png",
      fileName: layer.fileName
    } satisfies PhotoshopPackageFile])),
    [psdFileName]: {
      bytes: psdBytes,
      mimeType: "image/vnd.adobe.photoshop",
      fileName: psdFileName
    }
  };

  for (const file of Object.values(files)) {
    await writeFile(resolve(packageDir, file.fileName), file.bytes);
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const manifestUrl = packageUrl(baseUrl, packageId, manifestFileName, token);
  const manifest: PhotoshopPackageManifest = {
    version: 1,
    packageId,
    sourceAssetId: input.assetId,
    name: packageName,
    canvas: {
      width: Number(width),
      height: Number(height)
    },
    recommendedDocumentName: `${packageName}.psd`,
    tokenExpiresAt: expiresAt,
    workflow: {
      kind: "photoshop-mvp",
      layerStrategy: mvpLayers.strategy,
      notes: mvpLayers.notes
    },
    source: {
      fileName: asset.file.fileName,
      mimeType: asset.file.mimeType,
      width: Number(width),
      height: Number(height),
      url: packageUrl(baseUrl, packageId, compositeLayerFileName, token)
    },
    psd: {
      fileName: files[psdFileName].fileName,
      url: packageUrl(baseUrl, packageId, psdFileName, token)
    },
    layers: mvpLayers.layers.map((layer) => (
      layerManifest({
        packageId,
        baseUrl,
        token,
        width: Number(width),
        height: Number(height),
        fileName: layer.fileName,
        id: layer.id,
        name: layer.name,
        role: layer.role,
        importHint: layer.importHint,
        visible: layer.visible
      })
    ))
  };

  await writeFile(resolve(packageDir, manifestFileName), JSON.stringify(manifest, null, 2));
  await writeFile(resolve(packageDir, "metadata.json"), JSON.stringify({
    packageId,
    tokenHash: hashToken(token),
    expiresAt,
    createdAt: now.toISOString(),
    tenant,
    sourceAssetId: input.assetId,
    files: Object.fromEntries(Object.entries(files).map(([key, file]) => [key, {
      fileName: file.fileName,
      mimeType: file.mimeType
    }]))
  } satisfies StoredPackageMetadata, null, 2));

  return {
    packageId,
    manifestUrl,
    expiresAt,
    manifest
  };
}

export async function readPhotoshopPackageFile(
  packageId: string,
  fileName: string,
  token: string | undefined
): Promise<PhotoshopPackageFile | undefined> {
  const safePackageId = parsePackageId(packageId);
  const safeFileName = parsePackageFileName(fileName);
  if (!safePackageId || !safeFileName || !token) {
    return undefined;
  }

  const metadata = await readPackageMetadata(safePackageId);
  if (!metadata || new Date(metadata.expiresAt).getTime() < Date.now() || !isTokenMatch(token, metadata.tokenHash)) {
    return undefined;
  }

  if (safeFileName === manifestFileName) {
    const bytes = await readFile(resolvePackagePath(safePackageId, safeFileName));
    return {
      bytes,
      fileName: safeFileName,
      mimeType: "application/json"
    };
  }

  const file = metadata.files[safeFileName];
  if (!file) {
    return undefined;
  }

  const bytes = await readFile(resolvePackagePath(safePackageId, safeFileName));
  return {
    bytes,
    fileName: file.fileName,
    mimeType: file.mimeType
  };
}

async function createMvpLayers(
  sourcePng: Buffer,
  width: number,
  height: number
): Promise<{ layers: MvpPackageLayer[]; strategy: PhotoshopPackageManifest["workflow"]["layerStrategy"]; notes: string[] }> {
  const alphaMask = await alphaMaskIfUseful(sourcePng, width, height);
  if (!alphaMask) {
    const edgeBackgroundMask = await edgeBackgroundMaskIfUseful(sourcePng, width, height);
    if (edgeBackgroundMask) {
      const subjectLayer = await applyMask(sourcePng, edgeBackgroundMask);
      const backgroundLayer = await removeMaskedArea(sourcePng, edgeBackgroundMask);
      return {
        strategy: "edge-background",
        layers: standardPackageLayers(sourcePng, backgroundLayer, subjectLayer),
        notes: [
          "MVP package generated with edge-background subject detection.",
          "This works best for product images on white, solid, or simple studio backgrounds.",
          "Future versions can replace this with stronger segmentation, OCR, and real source-element layers."
        ]
      };
    }

    const designLayers = await createDesignElementLayers(sourcePng, width, height);
    if (designLayers) {
      return {
        strategy: "design-elements",
        layers: designLayers,
        notes: [
          "MVP package generated from a flat AI image using design-element heuristics.",
          "The background layer is cleaned under detected text/logo-copy areas to reduce drag ghosting.",
          "Detected text, logo copy, and divider lines are grouped into a transparent raster layer.",
          "This is still heuristic raster extraction, not editable text or vector recovery.",
          "Future versions can replace this with OCR, segmentation, inpainting, and real source-element layers."
        ]
      };
    }

    const colorLayers = await createColorClusterLayers(sourcePng, width, height);
    if (colorLayers.length >= 3) {
      return {
        strategy: "color-clusters",
        layers: [
          ...colorLayers,
          compositeReferenceLayer(sourcePng, false)
        ],
        notes: [
          "MVP package generated from a flat AI image using color-cluster raster layers.",
          "This is a fallback only; design-element extraction did not find a strong text/artwork mask.",
          "The layers are heuristic raster masks, not editable text, vector icons, or semantically recovered source elements.",
          "Future versions can replace this with OCR, segmentation, inpainting, and real source-element layers."
        ]
      };
    }

    const backgroundLayer = await flattenedBackground(sourcePng);
    return {
      strategy: "flat",
      layers: standardPackageLayers(sourcePng, backgroundLayer, sourcePng),
      notes: [
        "MVP package generated from a flat AI image.",
        "No useful alpha channel or color-cluster split was found, so the subject layer currently duplicates the full composite.",
        "Future versions can replace this with segmentation, OCR, and real source-element layers."
      ]
    };
  }

  const subjectLayer = await applyMask(sourcePng, alphaMask);
  const backgroundLayer = await removeMaskedArea(sourcePng, alphaMask);
  return {
    strategy: "alpha-channel",
    layers: standardPackageLayers(sourcePng, backgroundLayer, subjectLayer),
    notes: [
      "MVP package generated from the AI image alpha channel.",
      "The subject layer uses the source alpha as a transparency mask.",
      "Future versions can replace this with segmentation, OCR, and real source-element layers."
    ]
  };
}

function standardPackageLayers(sourcePng: Buffer, backgroundLayer: Buffer, subjectLayer: Buffer): MvpPackageLayer[] {
  return [
    {
      id: "background",
      name: "Background",
      role: "background",
      fileName: backgroundLayerFileName,
      image: backgroundLayer,
      importHint: "Place as the bottom pixel layer."
    },
    {
      id: "product",
      name: "Product / Subject",
      role: "subject",
      fileName: productLayerFileName,
      image: subjectLayer,
      importHint: "Place above the background. Transparent pixels are preserved when available."
    },
    compositeReferenceLayer(sourcePng)
  ];
}

function compositeReferenceLayer(sourcePng: Buffer, visible = true): MvpPackageLayer {
  return {
    id: "ai-composite",
    name: "AI Composite",
    role: "composite",
    fileName: compositeLayerFileName,
    image: sourcePng,
    importHint: "Place as the top reference layer and keep visible for comparison.",
    visible
  };
}

async function alphaMaskIfUseful(sourcePng: Buffer, width: number, height: number): Promise<Buffer | undefined> {
  const alpha = await sharp(sourcePng).ensureAlpha().extractChannel("alpha").raw().toBuffer();
  const channel = byteStats(alpha);
  const pixelCount = Math.max(1, width * height);
  const mean = channel.mean / 255;
  const hasTransparentPixels = channel.min < 250;
  const hasVisiblePixels = channel.max > 5;
  const hasMeaningfulCoverage = mean > 0.01 && mean < 0.99;
  return hasTransparentPixels && hasVisiblePixels && hasMeaningfulCoverage && channel.sum > pixelCount
    ? alphaBytesToMaskPng(alpha, width, height)
    : undefined;
}

async function createDesignElementLayers(sourcePng: Buffer, width: number, height: number): Promise<MvpPackageLayer[] | undefined> {
  const { data, info } = await sharp(sourcePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels < 4 || info.width !== width || info.height !== height) {
    return undefined;
  }

  const textMask = highContrastTextArtworkMask(data, width, height, info.channels);
  const coverage = maskCoverage(textMask);
  if (coverage < 0.002 || coverage > 0.09) {
    return undefined;
  }

  const expandedMask = expandMask(textMask, width, height, 1);
  const alphaMask = featherMask(expandedMask, width, height);
  const textArtwork = await layerFromAlpha(sourcePng, alphaMask, width, height);
  const cleanedBackground = await inpaintMaskedPixels(sourcePng, expandMask(textMask, width, height, 4), width, height);

  return [
    {
      id: "clean-background",
      name: "Clean Background",
      role: "background",
      fileName: backgroundLayerFileName,
      image: cleanedBackground,
      importHint: "Background with detected text/logo-copy areas filled from nearby pixels to reduce drag ghosting."
    },
    {
      id: "text-artwork",
      name: "Text / Logo Copy",
      role: "text",
      fileName: textArtworkLayerFileName,
      image: textArtwork,
      importHint: "Transparent raster layer for detected text, logo copy, and divider lines."
    },
    compositeReferenceLayer(sourcePng, false)
  ];
}

function highContrastTextArtworkMask(data: Buffer, width: number, height: number, channels: number): Buffer {
  const luminance = Buffer.alloc(width * height);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * channels;
    luminance[index] = Math.round(0.2126 * (data[offset] ?? 0) + 0.7152 * (data[offset + 1] ?? 0) + 0.0722 * (data[offset + 2] ?? 0));
  }

  const mask = Buffer.alloc(width * height);
  const minX = Math.round(width * 0.12);
  const maxX = Math.round(width * 0.88);
  const maxY = Math.round(height * 0.285);
  for (let y = 0; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const index = y * width + x;
      const offset = index * channels;
      const alpha = data[offset + 3] ?? 255;
      if (alpha <= 32) {
        continue;
      }
      const r = data[offset] ?? 0;
      const g = data[offset + 1] ?? 0;
      const b = data[offset + 2] ?? 0;
      const lightness = luminance[index] ?? 255;
      const neighborhood = localLuminanceRange(luminance, width, height, x, y, 2);
      const greenText = g >= r + 2 && g >= b - 8 && r < 92 && g < 112 && b < 96;
      const darkNeutralText = lightness < 72 && Math.max(r, g, b) - Math.min(r, g, b) < 44;
      const localContrast = neighborhood.max - neighborhood.min;
      if ((greenText || darkNeutralText) && localContrast > 18) {
        mask[index] = 255;
      }
    }
  }

  return keepLargeMaskComponents(closeMask(mask, width, height), width, height, Math.max(10, Math.round(width * height * 0.00001)));
}

function localLuminanceRange(luminance: Buffer, width: number, height: number, x: number, y: number, radius: number): { min: number; max: number } {
  let min = 255;
  let max = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    const yy = y + dy;
    if (yy < 0 || yy >= height) {
      continue;
    }
    for (let dx = -radius; dx <= radius; dx += 1) {
      const xx = x + dx;
      if (xx < 0 || xx >= width) {
        continue;
      }
      const value = luminance[yy * width + xx] ?? 0;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return { min, max };
}

function closeMask(mask: Buffer, width: number, height: number): Buffer {
  return erodeMask(dilateMask(mask, width, height, 1), width, height, 1);
}

function openMask(mask: Buffer, width: number, height: number): Buffer {
  return dilateMask(erodeMask(mask, width, height, 1), width, height, 1);
}

function dilateMask(mask: Buffer, width: number, height: number, radius: number): Buffer {
  const output = Buffer.alloc(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 0;
      for (let dy = -radius; dy <= radius && value === 0; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) {
          continue;
        }
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) {
            continue;
          }
          if ((mask[yy * width + xx] ?? 0) > 0) {
            value = 255;
            break;
          }
        }
      }
      output[y * width + x] = value;
    }
  }
  return output;
}

function erodeMask(mask: Buffer, width: number, height: number, radius: number): Buffer {
  const output = Buffer.alloc(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = true;
      for (let dy = -radius; dy <= radius && keep; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) {
          keep = false;
          break;
        }
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || (mask[yy * width + xx] ?? 0) === 0) {
            keep = false;
            break;
          }
        }
      }
      output[y * width + x] = keep ? 255 : 0;
    }
  }
  return output;
}

function expandMask(mask: Buffer, width: number, height: number, radius: number): Buffer {
  const output = Buffer.from(mask);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if ((mask[index] ?? 0) === 0) {
        continue;
      }
      const centerX = x;
      const centerY = y;
      const extraX = radius + Math.round(radius * 1.5);
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = centerY + dy;
        if (yy < 0 || yy >= height) {
          continue;
        }
        for (let dx = -extraX; dx <= extraX; dx += 1) {
          const xx = centerX + dx;
          if (xx < 0 || xx >= width) {
            continue;
          }
          output[yy * width + xx] = 255;
        }
      }
    }
  }
  return output;
}

function keepLargeMaskComponents(mask: Buffer, width: number, height: number, minArea: number): Buffer {
  const output = Buffer.alloc(mask.length);
  const visited = new Uint8Array(mask.length);
  const queue: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (visited[start] || (mask[start] ?? 0) === 0) {
      continue;
    }
    const component: number[] = [];
    visited[start] = 1;
    queue.push(start);
    while (queue.length > 0) {
      const index = queue.pop();
      if (index === undefined) {
        continue;
      }
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) {
          continue;
        }
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || (dx === 0 && dy === 0)) {
            continue;
          }
          const next = yy * width + xx;
          if (!visited[next] && (mask[next] ?? 0) > 0) {
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
    }
    if (component.length >= minArea) {
      for (const index of component) {
        output[index] = 255;
      }
    }
  }
  return output;
}

function featherMask(mask: Buffer, width: number, height: number): Buffer {
  const output = Buffer.alloc(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) {
          continue;
        }
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) {
            continue;
          }
          sum += mask[yy * width + xx] ?? 0;
          count += 1;
        }
      }
      output[y * width + x] = Math.round(sum / Math.max(1, count));
    }
  }
  return output;
}

function maskCoverage(mask: Buffer): number {
  let count = 0;
  for (const value of mask) {
    if (value > 0) {
      count += 1;
    }
  }
  return count / Math.max(1, mask.length);
}

async function layerFromAlpha(sourcePng: Buffer, alpha: Buffer, width: number, height: number): Promise<Buffer> {
  const { data, info } = await sharp(sourcePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels < 4 || info.width !== width || info.height !== height) {
    throw new PhotoshopPackageError("invalid_asset", "图层尺寸无法规范化。", 400);
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const sourceOffset = index * info.channels;
    const targetOffset = index * 4;
    const maskAlpha = alpha[index] ?? 0;
    rgba[targetOffset] = data[sourceOffset] ?? 0;
    rgba[targetOffset + 1] = data[sourceOffset + 1] ?? 0;
    rgba[targetOffset + 2] = data[sourceOffset + 2] ?? 0;
    rgba[targetOffset + 3] = Math.min(data[sourceOffset + 3] ?? 255, maskAlpha);
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function inpaintMaskedPixels(sourcePng: Buffer, mask: Buffer, width: number, height: number): Promise<Buffer> {
  const { data, info } = await sharp(sourcePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels < 4 || info.width !== width || info.height !== height) {
    throw new PhotoshopPackageError("invalid_asset", "背景修复尺寸无法规范化。", 400);
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const sourceOffset = index * info.channels;
    const targetOffset = index * 4;
    const replacement = (mask[index] ?? 0) > 0
      ? directionalFillColor(data, mask, width, height, info.channels, index)
      : undefined;
    rgba[targetOffset] = replacement?.r ?? (data[sourceOffset] ?? 0);
    rgba[targetOffset + 1] = replacement?.g ?? (data[sourceOffset + 1] ?? 0);
    rgba[targetOffset + 2] = replacement?.b ?? (data[sourceOffset + 2] ?? 0);
    rgba[targetOffset + 3] = data[sourceOffset + 3] ?? 255;
  }

  const remainingMask = Buffer.from(mask);
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = 0;
    const next = Buffer.from(rgba);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if ((remainingMask[index] ?? 0) === 0) {
          continue;
        }
        const average = averageUnmaskedNeighbor(rgba, remainingMask, width, height, x, y, Math.min(14, 3 + pass * 4));
        if (!average) {
          continue;
        }
        const targetOffset = index * 4;
        next[targetOffset] = average.r;
        next[targetOffset + 1] = average.g;
        next[targetOffset + 2] = average.b;
        next[targetOffset + 3] = average.a;
        remainingMask[index] = 0;
        changed += 1;
      }
    }
    rgba.set(next);
    if (changed === 0) {
      break;
    }
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function directionalFillColor(
  data: Buffer,
  mask: Buffer,
  width: number,
  height: number,
  channels: number,
  index: number
): { r: number; g: number; b: number } | undefined {
  const x = index % width;
  const y = Math.floor(index / width);
  const samples: Array<{ r: number; g: number; b: number; weight: number }> = [];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    for (let distance = 1; distance <= 42; distance += 1) {
      const xx = x + dx * distance;
      const yy = y + dy * distance;
      if (xx < 0 || xx >= width || yy < 0 || yy >= height) {
        break;
      }
      const sampleIndex = yy * width + xx;
      if ((mask[sampleIndex] ?? 0) > 0) {
        continue;
      }
      const offset = sampleIndex * channels;
      samples.push({
        r: data[offset] ?? 0,
        g: data[offset + 1] ?? 0,
        b: data[offset + 2] ?? 0,
        weight: 1 / Math.max(1, distance)
      });
      break;
    }
  }
  if (samples.length === 0) {
    return undefined;
  }
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;
  for (const sample of samples) {
    r += sample.r * sample.weight;
    g += sample.g * sample.weight;
    b += sample.b * sample.weight;
    weight += sample.weight;
  }
  return {
    r: Math.round(r / weight),
    g: Math.round(g / weight),
    b: Math.round(b / weight)
  };
}

function averageUnmaskedNeighbor(
  rgba: Buffer,
  mask: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number
): { r: number; g: number; b: number; a: number } | undefined {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    const yy = y + dy;
    if (yy < 0 || yy >= height) {
      continue;
    }
    for (let dx = -radius; dx <= radius; dx += 1) {
      const xx = x + dx;
      if (xx < 0 || xx >= width || (dx === 0 && dy === 0)) {
        continue;
      }
      const index = yy * width + xx;
      if ((mask[index] ?? 0) > 0) {
        continue;
      }
      const offset = index * 4;
      r += rgba[offset] ?? 0;
      g += rgba[offset + 1] ?? 0;
      b += rgba[offset + 2] ?? 0;
      a += rgba[offset + 3] ?? 255;
      count += 1;
    }
  }
  return count > 0
    ? {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count),
        a: Math.round(a / count)
      }
    : undefined;
}

async function createColorClusterLayers(sourcePng: Buffer, width: number, height: number): Promise<MvpPackageLayer[]> {
  const quantizedPng = await sharp(sourcePng)
    .ensureAlpha()
    .png({ palette: true, colors: colorClusterLayerCount, dither: 0 })
    .toBuffer();
  const [{ data: source, info: sourceInfo }, { data: quantized, info: quantizedInfo }] = await Promise.all([
    sharp(sourcePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(quantizedPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  ]);
  if (sourceInfo.channels < 4 || quantizedInfo.channels < 4 || sourceInfo.width !== width || quantizedInfo.width !== width || sourceInfo.height !== height || quantizedInfo.height !== height) {
    return [];
  }

  const clusters = new Map<string, { r: number; g: number; b: number; count: number; alphaSum: number }>();
  for (let offset = 0; offset < quantized.length; offset += quantizedInfo.channels) {
    const alpha = quantized[offset + 3] ?? 255;
    if (alpha <= 8) {
      continue;
    }
    const r = quantized[offset] ?? 0;
    const g = quantized[offset + 1] ?? 0;
    const b = quantized[offset + 2] ?? 0;
    const key = colorKey(r, g, b);
    const cluster = clusters.get(key) ?? { r, g, b, count: 0, alphaSum: 0 };
    cluster.count += 1;
    cluster.alphaSum += alpha;
    clusters.set(key, cluster);
  }

  const pixelCount = Math.max(1, width * height);
  const ordered = [...clusters.values()]
    .filter((cluster) => cluster.count / pixelCount >= 0.003)
    .sort((left, right) => right.count - left.count);
  if (ordered.length < 3) {
    return [];
  }

  const backgroundIndex = findBackgroundClusterIndex(ordered);
  const selected = ordered
    .map((cluster, index) => ({ cluster, index }))
    .filter((item) => item.index !== backgroundIndex)
    .slice(0, colorClusterLayerCount);
  if (selected.length < 2) {
    return [];
  }

  const layerBuffers = selected.map((item) => ({
    ...item,
    key: colorKey(item.cluster.r, item.cluster.g, item.cluster.b),
    rgba: Buffer.alloc(width * height * 4)
  }));

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const quantizedOffset = pixel * quantizedInfo.channels;
    const sourceOffset = pixel * sourceInfo.channels;
    const alpha = source[sourceOffset + 3] ?? 255;
    if (alpha <= 8) {
      continue;
    }
    const key = colorKey(quantized[quantizedOffset] ?? 0, quantized[quantizedOffset + 1] ?? 0, quantized[quantizedOffset + 2] ?? 0);
    for (const layer of layerBuffers) {
      if (key !== layer.key) {
        continue;
      }
      const targetOffset = pixel * 4;
      layer.rgba[targetOffset] = source[sourceOffset] ?? 0;
      layer.rgba[targetOffset + 1] = source[sourceOffset + 1] ?? 0;
      layer.rgba[targetOffset + 2] = source[sourceOffset + 2] ?? 0;
      layer.rgba[targetOffset + 3] = alpha;
      break;
    }
  }

  const sortedForStacking = layerBuffers
    .filter((layer) => layer.cluster.count > 0)
    .sort((left, right) => right.cluster.count - left.cluster.count);
  const layers = await Promise.all(sortedForStacking.map(async (layer, index) => {
    const hex = colorHex(layer.cluster.r, layer.cluster.g, layer.cluster.b);
    return {
      id: `color-${index + 1}`,
      name: `Color ${index + 1} ${hex}`,
      role: "color" as const,
      fileName: `color-${String(index + 1).padStart(2, "0")}-${hex.slice(1)}.png`,
      image: await sharp(layer.rgba, { raw: { width, height, channels: 4 } }).png().toBuffer(),
      importHint: "Heuristic color-cluster pixel layer extracted from a flat composite."
    };
  }));

  return layers.length >= 2 ? layers : [];
}

function findBackgroundClusterIndex(clusters: Array<{ r: number; g: number; b: number; count: number }>): number | undefined {
  if (clusters.length === 0) {
    return undefined;
  }
  const dominant = clusters[0];
  if (dominant && (dominant.r + dominant.g + dominant.b) / 3 > 210) {
    return 0;
  }
  return undefined;
}

function colorKey(r: number, g: number, b: number): string {
  return `${r},${g},${b}`;
}

function colorHex(r: number, g: number, b: number): string {
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
}

function hexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

async function edgeBackgroundMaskIfUseful(sourcePng: Buffer, width: number, height: number): Promise<Buffer | undefined> {
  const { data, info } = await sharp(sourcePng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels < 4) {
    return undefined;
  }

  const sample = sampleEdgeBackground(data, width, height, info.channels);
  if (!sample || sample.stdev > 48) {
    return undefined;
  }

  const threshold = Math.max(30, Math.min(86, sample.stdev * 2.2 + 28));
  const thresholdSq = threshold * threshold;
  const mask = Buffer.alloc(width * height);
  let visibleCount = 0;
  let edgeVisibleCount = 0;
  let edgeCount = 0;
  const edgeBand = edgeBandSize(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * info.channels;
      const alpha = data[sourceOffset + 3] ?? 255;
      const distanceSq = colorDistanceSq(
        data[sourceOffset] ?? 0,
        data[sourceOffset + 1] ?? 0,
        data[sourceOffset + 2] ?? 0,
        sample.r,
        sample.g,
        sample.b
      );
      const maskValue = alpha > 8 && distanceSq > thresholdSq ? 255 : 0;
      mask[y * width + x] = maskValue;
      if (maskValue > 0) {
        visibleCount += 1;
      }
      if (isEdgePixel(x, y, width, height, edgeBand)) {
        edgeCount += 1;
        if (maskValue > 0) {
          edgeVisibleCount += 1;
        }
      }
    }
  }

  const coverage = visibleCount / Math.max(1, width * height);
  const edgeCoverage = edgeVisibleCount / Math.max(1, edgeCount);
  if (coverage < 0.02 || coverage > 0.82 || edgeCoverage > 0.28) {
    return undefined;
  }

  return alphaBytesToMaskPng(mask, width, height);
}

function sampleEdgeBackground(
  data: Buffer,
  width: number,
  height: number,
  channels: number
): { r: number; g: number; b: number; stdev: number } | undefined {
  const edgeBand = edgeBandSize(width, height);
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 260));
  const samples: Array<[number, number, number]> = [];

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      if (!isEdgePixel(x, y, width, height, edgeBand)) {
        continue;
      }
      const offset = (y * width + x) * channels;
      if ((data[offset + 3] ?? 255) < 200) {
        continue;
      }
      samples.push([data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0]);
    }
  }

  if (samples.length < 32) {
    return undefined;
  }

  const sums = samples.reduce(
    (result, sample) => {
      result.r += sample[0];
      result.g += sample[1];
      result.b += sample[2];
      return result;
    },
    { r: 0, g: 0, b: 0 }
  );
  const background = {
    r: sums.r / samples.length,
    g: sums.g / samples.length,
    b: sums.b / samples.length
  };
  const variance = samples.reduce(
    (sum, sample) => sum + colorDistanceSq(sample[0], sample[1], sample[2], background.r, background.g, background.b),
    0
  ) / samples.length;

  return {
    ...background,
    stdev: Math.sqrt(variance)
  };
}

function edgeBandSize(width: number, height: number): number {
  return Math.max(6, Math.min(72, Math.round(Math.min(width, height) * 0.04)));
}

function isEdgePixel(x: number, y: number, width: number, height: number, edgeBand: number): boolean {
  return x < edgeBand || y < edgeBand || x >= width - edgeBand || y >= height - edgeBand;
}

function colorDistanceSq(leftR: number, leftG: number, leftB: number, rightR: number, rightG: number, rightB: number): number {
  return (leftR - rightR) ** 2 + (leftG - rightG) ** 2 + (leftB - rightB) ** 2;
}

function byteStats(bytes: Buffer): { min: number; max: number; sum: number; mean: number } {
  let min = 255;
  let max = 0;
  let sum = 0;
  for (const value of bytes) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  }
  return {
    min,
    max,
    sum,
    mean: sum / Math.max(1, bytes.length)
  };
}

async function alphaBytesToMaskPng(alphaBytes: Buffer, width: number, height: number): Promise<Buffer> {
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < alphaBytes.length; index += 1) {
    const offset = index * 4;
    rgba[offset] = 255;
    rgba[offset + 1] = 255;
    rgba[offset + 2] = 255;
    rgba[offset + 3] = alphaBytes[index] ?? 0;
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function applyMask(sourcePng: Buffer, maskPng: Buffer): Promise<Buffer> {
  return sharp(sourcePng)
    .ensureAlpha()
    .composite([{ input: maskPng, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function removeMaskedArea(sourcePng: Buffer, maskPng: Buffer): Promise<Buffer> {
  return sharp(sourcePng)
    .ensureAlpha()
    .composite([{ input: maskPng, blend: "dest-out" }])
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
}

async function flattenedBackground(sourcePng: Buffer): Promise<Buffer> {
  return sharp(sourcePng)
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
}

async function createLayeredPsd(input: { width: number; height: number; layers: PsdLayerInput[] }): Promise<Buffer> {
  const layerRecords: Buffer[] = [];
  const layerChannelDataBlocks: Buffer[] = [];
  const composite = Buffer.alloc(input.width * input.height * 4);
  const layersTopToBottom = [...input.layers].reverse();

  for (const layer of input.layers) {
    if (layer.visible === false) {
      continue;
    }
    const raw = await rgbaRaw(layer.image, input.width, input.height);
    alphaCompositeRaw(composite, raw);
  }

  for (const layer of layersTopToBottom) {
    const raw = await rgbaRaw(layer.image, input.width, input.height);
    const bbox = alphaBoundingBox(raw, input.width, input.height);
    if (!bbox) {
      continue;
    }

    const cropped = cropRgba(raw, input.width, bbox);
    const channelData = [
      channelBytes(cropped, 0),
      channelBytes(cropped, 1),
      channelBytes(cropped, 2),
      channelBytes(cropped, 3)
    ];
    const channelIds = [0, 1, 2, -1];
    const channelInfo = Buffer.concat(channelData.map((data, index) => {
      const buffer = Buffer.alloc(6);
      buffer.writeInt16BE(channelIds[index] ?? 0, 0);
      buffer.writeUInt32BE(2 + data.length, 2);
      return buffer;
    }));
    const layerData = Buffer.concat(channelData.map((data) => Buffer.concat([uint16(0), data])));
    const extra = layerExtraData(layer.name);
    const recordHead = Buffer.alloc(16 + 2 + channelInfo.length + 8 + 4);
    const layerFlags = layer.visible === false ? 2 : 0;
    let offset = 0;
    recordHead.writeInt32BE(bbox.top, offset); offset += 4;
    recordHead.writeInt32BE(bbox.left, offset); offset += 4;
    recordHead.writeInt32BE(bbox.bottom, offset); offset += 4;
    recordHead.writeInt32BE(bbox.right, offset); offset += 4;
    recordHead.writeUInt16BE(4, offset); offset += 2;
    channelInfo.copy(recordHead, offset); offset += channelInfo.length;
    Buffer.from("8BIMnorm", "ascii").copy(recordHead, offset); offset += 8;
    recordHead[offset] = 255; offset += 1; // opacity
    recordHead[offset] = 0; offset += 1; // clipping
    recordHead[offset] = layerFlags; offset += 1; // flags
    recordHead[offset] = 0; offset += 1; // filler
    if (offset !== recordHead.length) {
      throw new PhotoshopPackageError("invalid_asset", "PSD 图层记录写入长度异常。", 500);
    }

    layerRecords.push(Buffer.concat([recordHead, uint32(extra.length), extra]));
    layerChannelDataBlocks.push(layerData);
  }

  if (layerRecords.length === 0) {
    throw new PhotoshopPackageError("invalid_asset", "无法生成空 PSD 图层。", 400);
  }

  const layerInfo = padEven(Buffer.concat([int16(layerRecords.length), ...layerRecords, ...layerChannelDataBlocks]));
  const layerAndMaskPayload = Buffer.concat([uint32(layerInfo.length), layerInfo, uint32(0)]);
  const layerAndMask = Buffer.concat([uint32(layerAndMaskPayload.length), layerAndMaskPayload]);
  const compositeRgb = Buffer.concat([
    uint16(0),
    compositeChannelBytes(composite, 0),
    compositeChannelBytes(composite, 1),
    compositeChannelBytes(composite, 2)
  ]);

  const header = Buffer.alloc(26);
  header.write("8BPS", 0, "ascii");
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(3, 12);
  header.writeUInt32BE(input.height, 14);
  header.writeUInt32BE(input.width, 18);
  header.writeUInt16BE(8, 22);
  header.writeUInt16BE(3, 24);

  return Buffer.concat([
    header,
    uint32(0),
    uint32(0),
    layerAndMask,
    compositeRgb
  ]);
}

async function rgbaRaw(image: Buffer, width: number, height: number): Promise<Buffer> {
  const { data, info } = await sharp(image)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== width || info.height !== height || info.channels !== 4) {
    throw new PhotoshopPackageError("invalid_asset", "PSD 图层尺寸无法规范化。", 400);
  }
  return data;
}

function alphaCompositeRaw(base: Buffer, overlay: Buffer): void {
  for (let offset = 0; offset < base.length; offset += 4) {
    const overlayAlpha = (overlay[offset + 3] ?? 0) / 255;
    if (overlayAlpha <= 0) {
      continue;
    }
    const baseAlpha = (base[offset + 3] ?? 0) / 255;
    const outAlpha = overlayAlpha + baseAlpha * (1 - overlayAlpha);
    if (outAlpha <= 0) {
      continue;
    }
    for (let channel = 0; channel < 3; channel += 1) {
      const overlayValue = overlay[offset + channel] ?? 0;
      const baseValue = base[offset + channel] ?? 0;
      base[offset + channel] = Math.round((overlayValue * overlayAlpha + baseValue * baseAlpha * (1 - overlayAlpha)) / outAlpha);
    }
    base[offset + 3] = Math.round(outAlpha * 255);
  }
}

function alphaBoundingBox(raw: Buffer, width: number, height: number): { left: number; top: number; right: number; bottom: number } | undefined {
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = raw[(y * width + x) * 4 + 3] ?? 0;
      if (alpha === 0) {
        continue;
      }
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  return right > left && bottom > top ? { left, top, right, bottom } : undefined;
}

function cropRgba(raw: Buffer, sourceWidth: number, bbox: { left: number; top: number; right: number; bottom: number }): Buffer {
  const width = bbox.right - bbox.left;
  const height = bbox.bottom - bbox.top;
  const output = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((bbox.top + y) * sourceWidth + bbox.left) * 4;
    const targetStart = y * width * 4;
    raw.copy(output, targetStart, sourceStart, sourceStart + width * 4);
  }
  return output;
}

function channelBytes(rgba: Buffer, channel: number): Buffer {
  const output = Buffer.alloc(rgba.length / 4);
  for (let offset = channel, target = 0; offset < rgba.length; offset += 4, target += 1) {
    output[target] = rgba[offset] ?? 0;
  }
  return output;
}

function compositeChannelBytes(rgba: Buffer, channel: number): Buffer {
  const output = Buffer.alloc(rgba.length / 4);
  for (let offset = 0, target = 0; offset < rgba.length; offset += 4, target += 1) {
    const alpha = (rgba[offset + 3] ?? 0) / 255;
    const value = rgba[offset + channel] ?? 0;
    output[target] = Math.round(value * alpha + 255 * (1 - alpha));
  }
  return output;
}

function layerExtraData(name: string): Buffer {
  const pascal = pascalLayerName(name);
  const unicode = unicodeLayerNameBlock(name);
  return Buffer.concat([uint32(0), uint32(0), pascal, unicode]);
}

function pascalLayerName(name: string): Buffer {
  const raw = Buffer.from(name, "ascii").subarray(0, 255);
  return pad4(Buffer.concat([Buffer.from([raw.length]), raw]));
}

function unicodeLayerNameBlock(name: string): Buffer {
  const raw = Buffer.from(name, "utf16le").swap16();
  return layerResourceBlock("luni", Buffer.concat([uint32([...name].length), raw]));
}

function layerResourceBlock(key: string, payload: Buffer): Buffer {
  const keyBuffer = Buffer.from(key, "ascii");
  if (keyBuffer.length !== 4) {
    throw new PhotoshopPackageError("invalid_asset", "PSD 图层资源 key 非法。", 500);
  }
  return Buffer.concat([Buffer.from("8BIM", "ascii"), keyBuffer, uint32(payload.length), padEven(payload)]);
}

function uint16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value, 0);
  return buffer;
}

function int16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeInt16BE(value, 0);
  return buffer;
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

function padEven(buffer: Buffer): Buffer {
  return buffer.length % 2 === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(1)]);
}

function pad4(buffer: Buffer): Buffer {
  const padding = (4 - (buffer.length % 4)) % 4;
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding)]) : buffer;
}

function layerManifest(input: {
  packageId: string;
  baseUrl: string;
  token: string;
  width: number;
  height: number;
  fileName: string;
  id: PhotoshopPackageLayer["id"];
  name: string;
  role: PhotoshopPackageLayer["role"];
  importHint: string;
  visible?: boolean;
}): PhotoshopPackageLayer {
  return {
    id: input.id,
    name: input.name,
    kind: "pixel",
    role: input.role,
    visible: input.visible ?? true,
    opacity: 100,
    blendMode: "normal",
    bounds: {
      x: 0,
      y: 0,
      width: input.width,
      height: input.height
    },
    fileName: input.fileName,
    url: packageUrl(input.baseUrl, input.packageId, input.fileName, input.token),
    importHint: input.importHint
  };
}

async function readPackageMetadata(packageId: string): Promise<StoredPackageMetadata | undefined> {
  try {
    const bytes = await readFile(resolvePackagePath(packageId, "metadata.json"));
    const parsed = JSON.parse(bytes.toString("utf8")) as StoredPackageMetadata;
    return parsed && typeof parsed.packageId === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function packageUrl(baseUrl: string, packageId: string, fileName: string, token: string): string {
  const url = new URL(`/api/photoshop/packages/${encodeURIComponent(packageId)}/${encodeURIComponent(fileName)}`, `${baseUrl}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

function resolvePackagePath(packageId: string, fileName?: string): string {
  const packageDir = resolve(photoshopPackagesDir, packageId);
  return fileName ? resolve(packageDir, fileName) : packageDir;
}

function parsePackageId(value: string): string | undefined {
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_-]{16,64}$/u.test(trimmed) ? trimmed : undefined;
}

function parsePackageFileName(value: string): string | undefined {
  const safe = basename(value.trim());
  return safe === value && /^[a-zA-Z0-9._-]{1,120}$/u.test(safe) ? safe : undefined;
}

function randomPackageId(): string {
  return randomBytes(18).toString("base64url");
}

function sanitizePackageName(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 80);
  return safe || undefined;
}

function packageNameFromInput(value: string | undefined, assetId: string): string {
  return sanitizePackageName(value) ?? `photoshop-${assetId.slice(0, 8)}`;
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/u, "");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isTokenMatch(token: string, hash: string): boolean {
  const left = Buffer.from(hashToken(token), "hex");
  const right = Buffer.from(hash, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export class PhotoshopPackageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}
