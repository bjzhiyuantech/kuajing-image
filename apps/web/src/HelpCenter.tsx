import { Editor } from "@toast-ui/editor";
import "@toast-ui/editor/dist/toastui-editor.css";
import {
  BookOpen,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  PlayCircle,
  Plus,
  Save,
  Search,
  Trash2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import type { AdminHelpCenterResponse, HelpArticle, HelpAssetUploadResponse, HelpCategory, HelpCenterResponse } from "@gpt-image-canvas/shared";
import { authFetch, readApiError } from "./authClient";

const emptyHelpCenter: HelpCenterResponse = { categories: [], featuredArticles: [] };

const fallbackHelpCenter: HelpCenterResponse = {
  categories: [
    {
      id: "help-getting-started",
      slug: "getting-started",
      name: "注册与登录",
      description: "账号注册、登录、手机号验证和账号安全。",
      audience: "all",
      sortOrder: 10,
      enabled: true,
      createdAt: "",
      updatedAt: "",
      articles: [
        {
          id: "help-article-register-login",
          categoryId: "help-getting-started",
          categorySlug: "getting-started",
          slug: "register-login",
          title: "如何注册、登录并完成手机号验证",
          summary: "新用户可用手机号注册，已有用户直接登录；进入核心功能前需要完成手机号验证。",
          contentMarkdown: `## 操作步骤

1. 点击注册，填写手机号、验证码和密码。
2. 已有账号选择登录，输入手机号或邮箱和密码。
3. 进入账户页补充手机号验证，验证后可使用生图、作品库、充值等权益。

> 通过邀请链接注册时，邀请码会自动带入，双方可获得对应奖励。`,
          status: "published",
          featured: true,
          sortOrder: 10,
          tags: ["注册", "登录", "手机号"],
          createdAt: "",
          updatedAt: ""
        }
      ]
    },
    {
      id: "help-billing",
      slug: "billing",
      name: "充值、套餐与提现",
      description: "充值购买、余额、发票、邀请返现和提现说明。",
      audience: "all",
      sortOrder: 20,
      enabled: true,
      createdAt: "",
      updatedAt: "",
      articles: [
        {
          id: "help-article-withdraw",
          categoryId: "help-billing",
          categorySlug: "billing",
          slug: "withdraw-referral-balance",
          title: "如何提现邀请返现",
          summary: "当前系统已有邀请现金返现余额记录，但暂未开放用户端自动提现入口。",
          contentMarkdown: `> [!WARNING] 目前没有自动提现接口。邀请返现会进入现金激励账户，后台可查看返现流水；如需提现，建议先由客服或管理员人工登记处理。

## 建议后续补齐的提现规则

- 提现门槛：例如满 50 元可申请。
- 收款方式：支付宝账号、姓名、手机号。
- 审核状态：待审核、处理中、已打款、驳回。
- 风控限制：订单退款期后再结算返现。`,
          status: "published",
          featured: true,
          sortOrder: 20,
          tags: ["提现", "邀请返现", "余额"],
          createdAt: "",
          updatedAt: ""
        }
      ]
    }
  ],
  featuredArticles: []
};

export function HelpCenterPage({ onBack }: { onBack?: () => void }) {
  const [help, setHelp] = useState<HelpCenterResponse>(emptyHelpCenter);
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [activeArticleId, setActiveArticleId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function applyHelpState(body: HelpCenterResponse): void {
      setHelp(body);
      const firstCategory = body.categories[0];
      const firstArticle = body.featuredArticles[0] ?? firstCategory?.articles[0];
      setActiveCategoryId(firstCategory?.id ?? "");
      setActiveArticleId(firstArticle?.id ?? "");
    }

    async function loadHelp(): Promise<void> {
      setLoading(true);
      try {
        const response = await fetch("/api/help");
        if (!response.ok) {
          throw new Error("help unavailable");
        }
        const body = (await response.json()) as HelpCenterResponse;
        if (!cancelled) {
          applyHelpState(body);
        }
      } catch {
        if (!cancelled) {
          applyHelpState(fallbackHelpCenter);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadHelp();
    return () => {
      cancelled = true;
    };
  }, []);

  const allArticles = useMemo(() => help.categories.flatMap((category) => category.articles), [help.categories]);
  const filteredArticles = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return allArticles;
    }
    return allArticles.filter((article) => {
      const haystack = [article.title, article.summary, article.tags.join(" "), article.contentMarkdown].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [allArticles, query]);

  const activeCategory = help.categories.find((category) => category.id === activeCategoryId) ?? help.categories[0];
  const activeArticle = allArticles.find((article) => article.id === activeArticleId) ?? filteredArticles[0] ?? allArticles[0];

  useEffect(() => {
    if (activeArticle && activeArticle.categoryId !== activeCategoryId) {
      setActiveCategoryId(activeArticle.categoryId);
    }
  }, [activeArticle, activeCategoryId]);

  return (
    <main className="help-center-page app-view">
      <div className="help-center-shell">
        <header className="help-center-hero">
          <div>
            <p className="settings-eyebrow">Help Center</p>
            <h1>帮助中心</h1>
            <p>注册登录、充值提现、插件安装、作品查看、跨境电商与 1688 场景，都可以集中维护在这里。</p>
          </div>
          {onBack ? (
            <button className="secondary-action h-10" type="button" onClick={onBack}>
              返回画布
            </button>
          ) : null}
        </header>

        <label className="help-search">
          <Search className="size-4" aria-hidden="true" />
          <input placeholder="搜索：注册、充值、提现、插件、作品、1688、跨境" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>

        {loading ? (
          <div className="help-loading" role="status">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            正在载入帮助内容
          </div>
        ) : (
          <div className="help-layout">
            <aside className="help-sidebar" aria-label="帮助分类">
              {help.categories.map((category) => (
                <button
                  className={category.id === activeCategory?.id ? "help-category-button is-active" : "help-category-button"}
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setActiveCategoryId(category.id);
                    setActiveArticleId(category.articles[0]?.id ?? "");
                  }}
                >
                  <BookOpen className="size-4" aria-hidden="true" />
                  <span>{category.name}</span>
                  <small>{category.articles.length}</small>
                </button>
              ))}
            </aside>

            <section className="help-article-list" aria-label="帮助文章">
              {(query ? filteredArticles : activeCategory?.articles ?? []).map((article) => (
                <button
                  className={article.id === activeArticle?.id ? "help-article-card is-active" : "help-article-card"}
                  key={article.id}
                  type="button"
                  onClick={() => setActiveArticleId(article.id)}
                >
                  <span>
                    {article.featured ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <FileText className="size-4" aria-hidden="true" />}
                    {article.title}
                  </span>
                  <p>{article.summary}</p>
                  <em>{article.tags.join(" / ")}</em>
                </button>
              ))}
            </section>

            <article className="help-article-detail">
              {activeArticle ? (
                <>
                  <div className="help-article-detail__head">
                    <p>{activeCategory?.name ?? "帮助"}</p>
                    <h2>{activeArticle.title}</h2>
                    {activeArticle.summary ? <span>{activeArticle.summary}</span> : null}
                  </div>
                  {activeArticle.coverImageUrl ? <img className="help-cover-image" alt={activeArticle.title} src={activeArticle.coverImageUrl} /> : null}
                  {activeArticle.videoUrl ? <HelpVideo url={activeArticle.videoUrl} title={activeArticle.title} /> : null}
                  <MarkdownArticle markdown={activeArticle.contentMarkdown} />
                </>
              ) : (
                <div className="help-empty">暂无帮助内容</div>
              )}
            </article>
          </div>
        )}
      </div>
    </main>
  );
}

export function AdminHelpPanel() {
  const [help, setHelp] = useState<AdminHelpCenterResponse>({ ...emptyHelpCenter, drafts: [] });
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(createCategoryForm());
  const [articleForm, setArticleForm] = useState<ArticleForm>(createArticleForm());
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [editingArticleId, setEditingArticleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadHelp = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const response = await authFetch("/api/admin/help");
      if (!response.ok) {
        throw new Error(await readApiError(response, "帮助中心加载失败。"));
      }
      const body = (await response.json()) as AdminHelpCenterResponse;
      setHelp(body);
      setArticleForm((current) => ({
        ...current,
        categoryId: current.categoryId || body.categories[0]?.id || ""
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "帮助中心加载失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHelp();
  }, [loadHelp]);

  const allArticles = help.categories.flatMap((category) => category.articles).concat(help.drafts);
  const editArticleKey = `${editingArticleId || "new"}:${articleForm.categoryId}`;
  const handleArticleContentChange = useCallback((markdown: string) => {
    setArticleForm((current) => ({ ...current, contentMarkdown: markdown }));
  }, []);
  const handleHelpImageUpload = useCallback(async (blob: Blob): Promise<{ altText: string; url: string }> => {
    setError("");
    try {
      const formData = new FormData();
      const fileName = blob instanceof File && blob.name ? blob.name : "pasted-help-image.png";
      formData.append("file", blob, fileName);

      const response = await authFetch("/api/admin/help/assets", {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "帮助中心图片上传失败。"));
      }

      const upload = (await response.json()) as HelpAssetUploadResponse;
      setNotice("图片已上传到帮助中心素材目录。");
      return {
        altText: fileName.replace(/\.[^.]+$/u, "") || "帮助中心图片",
        url: upload.url
      };
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "帮助中心图片上传失败。";
      setError(message);
      throw new Error(message);
    }
  }, []);

  async function saveCategory(): Promise<void> {
    setSaving("category");
    setError("");
    setNotice("");
    try {
      const response = await authFetch(editingCategoryId ? `/api/admin/help/categories/${encodeURIComponent(editingCategoryId)}` : "/api/admin/help/categories", {
        method: editingCategoryId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryFormToPayload(categoryForm))
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "分类保存失败。"));
      }
      setNotice(editingCategoryId ? "分类已更新。" : "分类已新增。");
      setEditingCategoryId("");
      setCategoryForm(createCategoryForm());
      await loadHelp();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "分类保存失败。");
    } finally {
      setSaving("");
    }
  }

  async function saveArticle(): Promise<void> {
    setSaving("article");
    setError("");
    setNotice("");
    try {
      const response = await authFetch(editingArticleId ? `/api/admin/help/articles/${encodeURIComponent(editingArticleId)}` : "/api/admin/help/articles", {
        method: editingArticleId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(articleFormToPayload(articleForm))
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "文章保存失败。"));
      }
      setNotice(editingArticleId ? "文章已更新。" : "文章已新增。");
      setEditingArticleId("");
      setArticleForm(createArticleForm(help.categories[0]?.id ?? ""));
      await loadHelp();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "文章保存失败。");
    } finally {
      setSaving("");
    }
  }

  async function deleteItem(type: "category" | "article", id: string): Promise<void> {
    setSaving(`${type}:${id}`);
    setError("");
    setNotice("");
    try {
      const response = await authFetch(type === "category" ? `/api/admin/help/categories/${encodeURIComponent(id)}` : `/api/admin/help/articles/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "删除失败。"));
      }
      setNotice("已删除。");
      await loadHelp();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败。");
    } finally {
      setSaving("");
    }
  }

  return (
    <section className="admin-table-card admin-help-panel" aria-labelledby="admin-help-title">
      <div className="admin-table-card__title">
        <BookOpen className="size-4" aria-hidden="true" />
        <h2 id="admin-help-title">帮助中心管理</h2>
      </div>
      {error ? <p className="billing-alert billing-alert--warning" role="alert">{error}</p> : null}
      {notice ? <p className="billing-alert billing-alert--success" role="status">{notice}</p> : null}
      {loading ? (
        <div className="help-loading" role="status">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          正在载入帮助内容
        </div>
      ) : (
        <div className="admin-help-grid">
          <div className="admin-form-panel">
            <div className="admin-form-panel__title-row">
              <div>
                <p className="settings-eyebrow">Categories</p>
                <h3>{editingCategoryId ? "编辑分类" : "新增分类"}</h3>
              </div>
              <button
                className="secondary-action h-10"
                type="button"
                onClick={() => {
                  setEditingCategoryId("");
                  setCategoryForm(createCategoryForm());
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                新建
              </button>
            </div>
            <div className="admin-form-grid admin-form-grid--two">
              <label>
                <span>名称</span>
                <input className="admin-input" value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} />
              </label>
              <label>
                <span>Slug</span>
                <input className="admin-input" value={categoryForm.slug} onChange={(event) => setCategoryForm({ ...categoryForm, slug: event.target.value })} />
              </label>
              <label>
                <span>人群/场景</span>
                <input className="admin-input" value={categoryForm.audience} onChange={(event) => setCategoryForm({ ...categoryForm, audience: event.target.value })} />
              </label>
              <label>
                <span>排序</span>
                <input className="admin-input" inputMode="numeric" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm({ ...categoryForm, sortOrder: event.target.value })} />
              </label>
            </div>
            <label className="admin-help-full">
              <span>说明</span>
              <textarea className="admin-textarea" rows={2} value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} />
            </label>
            <label className="admin-switch admin-switch--inline">
              <input checked={categoryForm.enabled} type="checkbox" onChange={(event) => setCategoryForm({ ...categoryForm, enabled: event.target.checked })} />
              <span>{categoryForm.enabled ? "启用分类" : "隐藏分类"}</span>
            </label>
            <button className="primary-action h-10" disabled={saving === "category"} type="button" onClick={() => void saveCategory()}>
              {saving === "category" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              保存分类
            </button>
            <div className="admin-help-list">
              {help.categories.map((category) => (
                <div className="admin-help-row" key={category.id}>
                  <span>
                    <strong>{category.name}</strong>
                    <small>{category.slug}</small>
                  </span>
                  <div>
                    <button
                      className="admin-icon-button"
                      type="button"
                      onClick={() => {
                        setEditingCategoryId(category.id);
                        setCategoryForm(categoryToForm(category));
                      }}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                      <span>编辑</span>
                    </button>
                    <button className="admin-icon-button" disabled={saving === `category:${category.id}`} type="button" onClick={() => void deleteItem("category", category.id)}>
                      <Trash2 className="size-4" aria-hidden="true" />
                      <span>删除</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-form-panel">
            <div className="admin-form-panel__title-row">
              <div>
                <p className="settings-eyebrow">Articles</p>
                <h3>{editingArticleId ? "编辑文章" : "新增文章"}</h3>
              </div>
              <button
                className="secondary-action h-10"
                type="button"
                onClick={() => {
                  setEditingArticleId("");
                  setArticleForm(createArticleForm(help.categories[0]?.id ?? ""));
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                新建
              </button>
            </div>
            <div className="admin-form-grid admin-form-grid--two">
              <label>
                <span>分类</span>
                <select className="admin-input" value={articleForm.categoryId} onChange={(event) => setArticleForm({ ...articleForm, categoryId: event.target.value })}>
                  {help.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>标题</span>
                <input className="admin-input" value={articleForm.title} onChange={(event) => setArticleForm({ ...articleForm, title: event.target.value })} />
              </label>
              <label>
                <span>Slug</span>
                <input className="admin-input" value={articleForm.slug} onChange={(event) => setArticleForm({ ...articleForm, slug: event.target.value })} />
              </label>
              <label>
                <span>排序</span>
                <input className="admin-input" inputMode="numeric" value={articleForm.sortOrder} onChange={(event) => setArticleForm({ ...articleForm, sortOrder: event.target.value })} />
              </label>
              <label>
                <span>封面图 URL</span>
                <input className="admin-input" value={articleForm.coverImageUrl} onChange={(event) => setArticleForm({ ...articleForm, coverImageUrl: event.target.value })} />
              </label>
              <label>
                <span>视频 URL</span>
                <input className="admin-input" value={articleForm.videoUrl} onChange={(event) => setArticleForm({ ...articleForm, videoUrl: event.target.value })} />
              </label>
            </div>
            <label className="admin-help-full">
              <span>摘要</span>
              <textarea className="admin-textarea" rows={2} value={articleForm.summary} onChange={(event) => setArticleForm({ ...articleForm, summary: event.target.value })} />
            </label>

            <div className="admin-help-editor">
              <div className="admin-help-editor__head">
                <span>Markdown 内容</span>
                <small>支持标题、列表、图片、代码块、引用和视频 HTML</small>
              </div>
              <MarkdownEditor
                value={articleForm.contentMarkdown}
                onChange={handleArticleContentChange}
                onUploadImage={handleHelpImageUpload}
                editorKey={editArticleKey}
              />
            </div>

            <div className="admin-form-grid admin-form-grid--two">
              <label>
                <span>标签，逗号分隔</span>
                <input className="admin-input" value={articleForm.tagsText} onChange={(event) => setArticleForm({ ...articleForm, tagsText: event.target.value })} />
              </label>
              <label>
                <span>状态</span>
                <select className="admin-input" value={articleForm.status} onChange={(event) => setArticleForm({ ...articleForm, status: event.target.value as ArticleForm["status"] })}>
                  <option value="published">已发布</option>
                  <option value="draft">草稿</option>
                </select>
              </label>
            </div>
            <label className="admin-switch admin-switch--inline">
              <input checked={articleForm.featured} type="checkbox" onChange={(event) => setArticleForm({ ...articleForm, featured: event.target.checked })} />
              <span>推荐文章</span>
            </label>
            <button className="primary-action h-10" disabled={saving === "article"} type="button" onClick={() => void saveArticle()}>
              {saving === "article" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
              保存文章
            </button>
          </div>
        </div>
      )}

      <div className="admin-help-articles">
        {allArticles.map((article) => (
          <div className="admin-help-row" key={article.id}>
            <span>
              <strong>{article.title}</strong>
              <small>
                {article.status === "published" ? "已发布" : "草稿"} · {article.categorySlug || article.categoryId}
              </small>
            </span>
            <div>
              <button
                className="admin-icon-button"
                type="button"
                onClick={() => {
                  setEditingArticleId(article.id);
                  setArticleForm(articleToForm(article));
                }}
              >
                <Pencil className="size-4" aria-hidden="true" />
                <span>编辑</span>
              </button>
              <button className="admin-icon-button" disabled={saving === `article:${article.id}`} type="button" onClick={() => void deleteItem("article", article.id)}>
                <Trash2 className="size-4" aria-hidden="true" />
                <span>删除</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MarkdownArticle({ markdown }: { markdown: string }) {
  return (
    <div className="help-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          img: ({ node, ...props }) => <img className="help-markdown__image" {...props} alt={props.alt || ""} />,
          a: ({ node, ...props }) => (
            <a className="help-markdown__link" {...props} target={props.href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer" />
          )
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function HelpVideo({ url, title }: { url: string; title: string }) {
  if (/\.(mp4|webm|ogg)(\?|$)/iu.test(url)) {
    return <video className="help-video" controls src={url} title={title} />;
  }
  return (
    <a className="help-video-link" href={url} target="_blank" rel="noreferrer">
      <PlayCircle className="size-5" aria-hidden="true" />
      打开视频：{title}
    </a>
  );
}

function MarkdownEditor({
  editorKey,
  value,
  onChange,
  onUploadImage
}: {
  editorKey: string;
  value: string;
  onChange: (value: string) => void;
  onUploadImage: (blob: Blob) => Promise<{ altText: string; url: string }>;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const editor = new Editor({
      el: hostRef.current,
      height: "440px",
      initialEditType: "wysiwyg",
      previewStyle: "vertical",
      initialValue: value,
      usageStatistics: false,
      hideModeSwitch: false,
      toolbarItems: [
        ["heading", "bold", "italic", "strike"],
        ["hr", "quote"],
        ["ul", "ol", "task"],
        ["table", "image", "link"],
        ["code", "codeblock"]
      ],
      hooks: {
        addImageBlobHook: (blob, callback) => {
          void onUploadImage(blob)
            .then((upload) => {
              callback(upload.url, upload.altText);
            })
            .catch(() => undefined);
          return false;
        }
      }
    });

    editor.on("change", () => {
      onChange(editor.getMarkdown());
    });

    return () => {
      editor.destroy();
    };
  }, [editorKey, onChange, onUploadImage]);

  return <div ref={hostRef} className="help-editor-host" />;
}

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
  audience: string;
  sortOrder: string;
  enabled: boolean;
}

interface ArticleForm {
  categoryId: string;
  title: string;
  slug: string;
  summary: string;
  contentMarkdown: string;
  coverImageUrl: string;
  videoUrl: string;
  status: "draft" | "published";
  featured: boolean;
  sortOrder: string;
  tagsText: string;
}

function createCategoryForm(): CategoryForm {
  return { name: "", slug: "", description: "", audience: "", sortOrder: "0", enabled: true };
}

function createArticleForm(categoryId = ""): ArticleForm {
  return {
    categoryId,
    title: "",
    slug: "",
    summary: "",
    contentMarkdown: `## 内容

在这里填写帮助文章正文。

## 步骤

1. 第一步
2. 第二步
3. 第三步`,
    coverImageUrl: "",
    videoUrl: "",
    status: "published",
    featured: false,
    sortOrder: "0",
    tagsText: ""
  };
}

function categoryToForm(category: HelpCategory): CategoryForm {
  return {
    name: category.name,
    slug: category.slug,
    description: category.description ?? "",
    audience: category.audience ?? "",
    sortOrder: String(category.sortOrder),
    enabled: category.enabled
  };
}

function articleToForm(article: HelpArticle): ArticleForm {
  return {
    categoryId: article.categoryId,
    title: article.title,
    slug: article.slug,
    summary: article.summary ?? "",
    contentMarkdown: article.contentMarkdown,
    coverImageUrl: article.coverImageUrl ?? "",
    videoUrl: article.videoUrl ?? "",
    status: article.status,
    featured: article.featured,
    sortOrder: String(article.sortOrder),
    tagsText: article.tags.join(", ")
  };
}

function categoryFormToPayload(form: CategoryForm) {
  return {
    name: form.name,
    slug: form.slug || undefined,
    description: form.description || undefined,
    audience: form.audience || undefined,
    sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
    enabled: form.enabled
  };
}

function articleFormToPayload(form: ArticleForm) {
  return {
    categoryId: form.categoryId,
    title: form.title,
    slug: form.slug || undefined,
    summary: form.summary || undefined,
    contentMarkdown: form.contentMarkdown,
    coverImageUrl: form.coverImageUrl || undefined,
    videoUrl: form.videoUrl || undefined,
    status: form.status,
    featured: form.featured,
    sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
    tags: form.tagsText.split(/[,，]/u).map((item) => item.trim()).filter(Boolean)
  };
}
