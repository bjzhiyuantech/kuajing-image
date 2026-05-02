import type { PageContext } from "./types";

function readMeta(selector: string): string {
  return document.querySelector<HTMLMetaElement>(selector)?.content.trim() ?? "";
}

function pageContext(): PageContext {
  const imageUrls = new Set<string>();
  const ogImage = readMeta('meta[property="og:image"], meta[name="og:image"]');
  if (ogImage) {
    imageUrls.add(new URL(ogImage, location.href).toString());
  }

  for (const image of Array.from(document.images).slice(0, 80)) {
    const src = image.currentSrc || image.src;
    if (src && image.naturalWidth >= 240 && image.naturalHeight >= 240) {
      imageUrls.add(new URL(src, location.href).toString());
    }
  }

  return {
    title: document.title.trim(),
    description: readMeta('meta[name="description"], meta[property="og:description"]'),
    url: location.href,
    imageUrls: Array.from(imageUrls).slice(0, 24)
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
