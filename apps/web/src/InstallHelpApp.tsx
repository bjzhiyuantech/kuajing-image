import { Copy, Download, ExternalLink, Globe, Package, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_ZIP_DOWNLOAD_URL = "https://imagen.neimou.com/downloads/kuajing-image-extension-prod-latest.zip";
const RELEASE_MANIFEST_URL = "/downloads/kuajing-image-extension-prod-latest.json";

interface ExtensionReleaseManifest {
  version?: string;
  latestDownloadUrl?: string;
  downloadUrl?: string;
}

function extensionManagerUrl(browser: "chrome" | "edge"): string {
  return browser === "chrome" ? "chrome://extensions" : "edge://extensions";
}

function releaseDownloadUrl(manifest: ExtensionReleaseManifest): string {
  const rawUrl = manifest.latestDownloadUrl || manifest.downloadUrl || DEFAULT_ZIP_DOWNLOAD_URL;
  const url = new URL(rawUrl, window.location.origin);
  if (manifest.version) {
    url.searchParams.set("v", manifest.version);
  }
  return url.toString();
}

export function InstallHelpApp() {
  const [copied, setCopied] = useState(false);
  const [activeBrowser, setActiveBrowser] = useState<"chrome" | "edge">("chrome");
  const [zipDownloadUrl, setZipDownloadUrl] = useState(DEFAULT_ZIP_DOWNLOAD_URL);
  const extensionPage = useMemo(() => extensionManagerUrl(activeBrowser), [activeBrowser]);

  useEffect(() => {
    let cancelled = false;

    async function loadReleaseManifest() {
      try {
        const response = await fetch(`${RELEASE_MANIFEST_URL}?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const manifest = (await response.json()) as ExtensionReleaseManifest;
        if (!cancelled) {
          setZipDownloadUrl(releaseDownloadUrl(manifest));
        }
      } catch {
        if (!cancelled) {
          setZipDownloadUrl(DEFAULT_ZIP_DOWNLOAD_URL);
        }
      }
    }

    void loadReleaseManifest();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(zipDownloadUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="install-help-page">
      <section className="install-hero">
        <div className="install-badge">
          <Package size={14} />
          插件安装帮助
        </div>
        <h1>下载压缩包，按浏览器完成安装</h1>
        <p>先下载最新插件压缩包，解压后再在 Chrome 或 Edge 中加载扩展目录。后续插件会自动检测新版，并从这里下载升级包。</p>
      </section>

      <section className="install-download-card">
        <div className="install-download-header">
          <div>
            <h2>插件压缩包下载</h2>
            <p>始终指向当前生产版最新安装包。</p>
          </div>
          <a className="install-download-button" href={zipDownloadUrl} target="_blank" rel="noreferrer">
            <Download size={16} />
            下载压缩包
          </a>
        </div>

        <div className="install-link-row">
          <div className="install-link">
            <span>ZIP 地址</span>
            <code>{zipDownloadUrl}</code>
          </div>
          <button className="install-ghost-button" type="button" onClick={handleCopyLink}>
            <Copy size={16} />
            {copied ? "已复制" : "复制链接"}
          </button>
        </div>
      </section>

      <section className="install-browser-switcher">
        <button
          type="button"
          className={activeBrowser === "chrome" ? "install-browser-pill active" : "install-browser-pill"}
          onClick={() => setActiveBrowser("chrome")}
        >
          <Globe size={16} />
          Chrome
        </button>
        <button
          type="button"
          className={activeBrowser === "edge" ? "install-browser-pill active" : "install-browser-pill"}
          onClick={() => setActiveBrowser("edge")}
        >
          <Globe size={16} />
          Edge
        </button>
      </section>

      <section className="install-steps-grid">
        <article className="install-step-card">
          <div className="install-step-title">
            <ShieldCheck size={18} />
            安装步骤
          </div>
          <ol>
            <li>下载并解压插件压缩包。</li>
            <li>打开浏览器扩展管理页。</li>
            <li>开启右上角的“开发者模式”。</li>
            <li>点击“加载已解压的扩展程序”，选择解压后的文件夹。</li>
          </ol>
        </article>

        <article className="install-step-card">
          <div className="install-step-title">
            <ExternalLink size={18} />
            当前入口
          </div>
          <p className="install-page-link">{extensionPage}</p>
          <p className="install-hint">Chrome 用 chrome://extensions，Edge 用 edge://extensions。</p>
        </article>
      </section>

      <section className="install-browser-notes">
        <article className="install-note-card">
          <h3>Chrome</h3>
          <p>进入扩展页后，打开开发者模式，再加载解压目录。</p>
        </article>
        <article className="install-note-card">
          <h3>Edge</h3>
          <p>操作流程和 Chrome 一样，只是地址换成 Edge 的扩展页。</p>
        </article>
      </section>
    </main>
  );
}
