import { randomUUID } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import type {
  AdminHelpCenterResponse,
  HelpArticle,
  HelpArticleStatus,
  HelpCategory,
  HelpCenterResponse,
  SaveHelpArticleRequest,
  SaveHelpCategoryRequest
} from "./contracts.js";
import { db } from "./database.js";
import { helpArticles, helpCategories } from "./schema.js";

type HelpCategoryRow = typeof helpCategories.$inferSelect;
type HelpArticleRow = typeof helpArticles.$inferSelect;

export class HelpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

export async function getHelpCenter(): Promise<HelpCenterResponse> {
  const [categories, articles] = await Promise.all([
    db
      .select()
      .from(helpCategories)
      .where(eq(helpCategories.enabled, 1))
      .orderBy(asc(helpCategories.sortOrder), asc(helpCategories.createdAt)),
    db
      .select()
      .from(helpArticles)
      .where(eq(helpArticles.status, "published"))
      .orderBy(desc(helpArticles.featured), asc(helpArticles.sortOrder), asc(helpArticles.createdAt))
  ]);

  return composeHelpCenter(categories, articles);
}

export async function getAdminHelpCenter(): Promise<AdminHelpCenterResponse> {
  const [categories, articles] = await Promise.all([
    db.select().from(helpCategories).orderBy(asc(helpCategories.sortOrder), asc(helpCategories.createdAt)),
    db.select().from(helpArticles).orderBy(desc(helpArticles.featured), asc(helpArticles.sortOrder), asc(helpArticles.createdAt))
  ]);
  const composed = composeHelpCenter(categories, articles);
  const categorySlugMap = categorySlugById(categories);
  return {
    ...composed,
    drafts: articles.filter((article) => article.status !== "published").map((article) => toHelpArticle(article, categorySlugMap))
  };
}

export async function createHelpCategory(input: SaveHelpCategoryRequest): Promise<{ category: HelpCategory }> {
  const now = new Date().toISOString();
  const id = randomUUID();
  await db.insert(helpCategories).values({
    id,
    slug: normalizeSlug(input.slug || input.name),
    name: input.name.trim(),
    description: normalizeOptional(input.description),
    audience: normalizeOptional(input.audience),
    sortOrder: input.sortOrder ?? 0,
    enabled: input.enabled === false ? 0 : 1,
    createdAt: now,
    updatedAt: now
  });
  return { category: toHelpCategory(await getCategoryOrThrow(id)) };
}

export async function updateHelpCategory(id: string, input: SaveHelpCategoryRequest): Promise<{ category: HelpCategory }> {
  await getCategoryOrThrow(id);
  await db
    .update(helpCategories)
    .set({
      slug: normalizeSlug(input.slug || input.name),
      name: input.name.trim(),
      description: normalizeOptional(input.description),
      audience: normalizeOptional(input.audience),
      sortOrder: input.sortOrder ?? 0,
      enabled: input.enabled === false ? 0 : 1,
      updatedAt: new Date().toISOString()
    })
    .where(eq(helpCategories.id, id));
  return { category: toHelpCategory(await getCategoryOrThrow(id)) };
}

export async function deleteHelpCategory(id: string): Promise<{ ok: true }> {
  await getCategoryOrThrow(id);
  await db.delete(helpCategories).where(eq(helpCategories.id, id));
  return { ok: true };
}

export async function createHelpArticle(input: SaveHelpArticleRequest): Promise<{ article: HelpArticle }> {
  await getCategoryOrThrow(input.categoryId);
  const now = new Date().toISOString();
  const id = randomUUID();
  await db.insert(helpArticles).values({
    id,
    categoryId: input.categoryId,
    slug: normalizeSlug(input.slug || input.title),
    title: input.title.trim(),
    summary: normalizeOptional(input.summary),
    contentJson: normalizeMarkdown(input.contentMarkdown),
    coverImageUrl: normalizeOptional(input.coverImageUrl),
    videoUrl: normalizeOptional(input.videoUrl),
    status: normalizeStatus(input.status),
    featured: input.featured ? 1 : 0,
    sortOrder: input.sortOrder ?? 0,
    tagsJson: JSON.stringify(input.tags ?? []),
    createdAt: now,
    updatedAt: now
  });
  return { article: await getArticleViewOrThrow(id) };
}

export async function updateHelpArticle(id: string, input: SaveHelpArticleRequest): Promise<{ article: HelpArticle }> {
  await getArticleOrThrow(id);
  await getCategoryOrThrow(input.categoryId);
  await db
    .update(helpArticles)
    .set({
      categoryId: input.categoryId,
      slug: normalizeSlug(input.slug || input.title),
      title: input.title.trim(),
      summary: normalizeOptional(input.summary),
      contentJson: normalizeMarkdown(input.contentMarkdown),
      coverImageUrl: normalizeOptional(input.coverImageUrl),
      videoUrl: normalizeOptional(input.videoUrl),
      status: normalizeStatus(input.status),
      featured: input.featured ? 1 : 0,
      sortOrder: input.sortOrder ?? 0,
      tagsJson: JSON.stringify(input.tags ?? []),
      updatedAt: new Date().toISOString()
    })
    .where(eq(helpArticles.id, id));
  return { article: await getArticleViewOrThrow(id) };
}

export async function deleteHelpArticle(id: string): Promise<{ ok: true }> {
  await getArticleOrThrow(id);
  await db.delete(helpArticles).where(eq(helpArticles.id, id));
  return { ok: true };
}

async function getCategoryOrThrow(id: string): Promise<HelpCategoryRow> {
  const [category] = await db.select().from(helpCategories).where(eq(helpCategories.id, id)).limit(1);
  if (!category) {
    throw new HelpError("not_found", "帮助分类不存在。", 404);
  }
  return category;
}

async function getArticleOrThrow(id: string): Promise<HelpArticleRow> {
  const [article] = await db.select().from(helpArticles).where(eq(helpArticles.id, id)).limit(1);
  if (!article) {
    throw new HelpError("not_found", "帮助文章不存在。", 404);
  }
  return article;
}

async function getArticleViewOrThrow(id: string): Promise<HelpArticle> {
  const article = await getArticleOrThrow(id);
  const categories = await db.select().from(helpCategories);
  return toHelpArticle(article, categorySlugById(categories));
}

function composeHelpCenter(categories: HelpCategoryRow[], articles: HelpArticleRow[]): HelpCenterResponse {
  const categorySlugMap = categorySlugById(categories);
  const articleViews = articles.map((article) => toHelpArticle(article, categorySlugMap));
  return {
    categories: categories.map((category) => ({
      ...toHelpCategory(category),
      articles: articleViews.filter((article) => article.categoryId === category.id)
    })),
    featuredArticles: articleViews.filter((article) => article.featured)
  };
}

function toHelpCategory(row: HelpCategoryRow): HelpCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? undefined,
    audience: row.audience ?? undefined,
    sortOrder: Number(row.sortOrder ?? 0),
    enabled: row.enabled === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toHelpArticle(row: HelpArticleRow, categorySlugs: Map<string, string>): HelpArticle {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categorySlug: categorySlugs.get(row.categoryId),
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? undefined,
    contentMarkdown: readContentMarkdown(row.contentJson),
    coverImageUrl: row.coverImageUrl ?? undefined,
    videoUrl: row.videoUrl ?? undefined,
    status: normalizeStatus(row.status),
    featured: row.featured === 1,
    sortOrder: Number(row.sortOrder ?? 0),
    tags: parseStringArray(row.tagsJson),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function categorySlugById(categories: HelpCategoryRow[]): Map<string, string> {
  return new Map(categories.map((category) => [category.id, category.slug]));
}

function readContentMarkdown(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[")) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? legacyBlocksToMarkdown(parsed) : trimmed;
  } catch {
    return trimmed;
  }
}

function legacyBlocksToMarkdown(blocks: unknown[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (!isRecord(block)) continue;
    const type = typeof block.type === "string" ? block.type : "paragraph";
    const title = stringValue(block.title);
    const text = stringValue(block.text);
    if (type === "heading" && (title || text)) {
      lines.push(`## ${title || text}`);
    } else if (type === "steps" || type === "list") {
      if (title) lines.push(`## ${title}`);
      lines.push(...arrayStrings(block.items).map((item, index) => `${type === "steps" ? `${index + 1}.` : "-"} ${item}`));
    } else if (type === "image") {
      const url = stringValue(block.url);
      if (url) lines.push(`![${stringValue(block.alt) || title || "image"}](${url})`);
    } else if (type === "video") {
      const url = stringValue(block.url);
      if (url) lines.push(`<video controls src="${url}"></video>`);
    } else if (type === "callout" && text) {
      lines.push(`> ${text}`);
    } else if (text) {
      lines.push(text);
    }
  }
  return lines.join("\n\n").trim();
}

function normalizeStatus(value: unknown): HelpArticleStatus {
  return value === "draft" ? "draft" : "published";
}

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n/gu, "\n").trim();
}

function normalizeOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalizeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120);
  return slug || randomUUID();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function arrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}
