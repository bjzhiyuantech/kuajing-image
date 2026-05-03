import { Copy, Download, ExternalLink, Globe, Package, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

const ZIP_DOWNLOAD_URL = "/downloads/kuajing-image-extension.zip";

function extensionManagerUrl(browser: "chrome" | "edge"): string {
  return browser === "chrome" ? "chrome://extensions" : "edge://extensions";
}

export function InstallHelpApp() {
  const [copied, setCopied] = useState(false);
  const [activeBrowser, setActiveBrowser] = useState<"chrome" | "edge">("chrome");
  const extensionPage = useMemo(() => extensionManagerUrl(activeBrowser), [activeBrowser]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(ZIP_DOWNLOAD_URL);
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
        <p>先下载插件压缩包，解压后再在 Chrome 或 Edge 中加载扩展目录。下载地址已预留，替换成正式链接后即可使用。</p>
      </section>

      <section className="install-download-card">
        <div className="install-download-header">
          <div>
            <h2>插件压缩包下载</h2>
            <p>请把这里的地址替换为正式 zip 文件地址。</p>
          </div>
          <a className="install-download-button" href={ZIP_DOWNLOAD_URL} target="_blank" rel="noreferrer">
            <Download size={16} />
            下载压缩包
          </a>
        </div>

        <div className="install-link-row">
          <div className="install-link">
            <span>ZIP 地址</span>
            <code>{ZIP_DOWNLOAD_URL}</code>
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
