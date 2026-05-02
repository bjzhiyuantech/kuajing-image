import type { PageContext } from "./types";

function readMeta(selector: string): string {
  return document.querySelector<HTMLMetaElement>(selector)?.content.trim() ?? "";
}

function absoluteUrl(value: string): string {
  try {
    return new URL(value, location.href).toString();
  } catch {
    return "";
  }
}

function addImageUrl(imageUrls: Set<string>, value: string | null | undefined): void {
  if (!value || value.startsWith("data:")) {
    return;
  }
  const url = absoluteUrl(value.trim());
  if (url) {
    imageUrls.add(url);
  }
}

function addSrcsetUrls(imageUrls: Set<string>, value: string | null | undefined): void {
  if (!value) {
    return;
  }
  for (const candidate of value.split(",")) {
    addImageUrl(imageUrls, candidate.trim().split(/\s+/u)[0]);
  }
}

function readProductTitle(): string {
  const metaTitle = readMeta('meta[property="og:title"], meta[name="title"]');
  const titleSelectors = [
    "h1",
    "[class*='offer-title']",
    "[class*='product-title']",
    "[class*='ProductTitle']",
    "[class*='title'], [class*='Title']"
  ];
  const headingTitle =
    titleSelectors
      .map((selector) => document.querySelector<HTMLElement>(selector)?.textContent?.trim() ?? "")
      .find((value) => value.length >= 4) ?? "";
  return (headingTitle || metaTitle || document.title).trim();
}

function pageContext(): PageContext {
  const imageUrls = new Set<string>();
  const ogImage = readMeta('meta[property="og:image"], meta[name="og:image"]');
  addImageUrl(imageUrls, ogImage);

  for (const image of Array.from(document.images)) {
    const renderedWidth = image.naturalWidth || image.width;
    const renderedHeight = image.naturalHeight || image.height;
    if (renderedWidth >= 160 && renderedHeight >= 160) {
      addImageUrl(imageUrls, image.currentSrc || image.src);
      addImageUrl(imageUrls, image.getAttribute("data-src"));
      addImageUrl(imageUrls, image.getAttribute("data-lazy-src"));
      addImageUrl(imageUrls, image.getAttribute("data-original"));
      addSrcsetUrls(imageUrls, image.srcset || image.getAttribute("data-srcset"));
    }
  }

  return {
    title: readProductTitle(),
    description: readMeta('meta[name="description"], meta[property="og:description"]'),
    url: location.href,
    imageUrls: Array.from(imageUrls).slice(0, 48)
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "kuajing-image:get-page-context") {
    sendResponse(pageContext());
    return true;
  }

  if (message?.type === "kuajing-image:sync-auth" && typeof message.token === "string") {
    window.postMessage(
      {
        source: "kuajing-image-extension",
        type: "kuajing-image:auth-token",
        token: message.token
      },
      window.location.origin
    );
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
