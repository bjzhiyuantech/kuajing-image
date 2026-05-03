const IMAGE_URL_PATTERN = /(?:https?:)?\/\/[^"'()<>\s\\]+?\.(?:jpg|jpeg|png|webp|gif|bmp|avif)(?:[._!-][^"'()<>\s\\?]*)?(?:\?[^"'()<>\s\\]*)?/giu;

function normalize(value: string): string {
  return String(value || "")
    .trim()
    .replace(/^url\(["']?/u, "")
    .replace(/["']?\)$/u, "")
    .replace(/\\u002f/giu, "/")
    .replace(/\\\//gu, "/")
    .replace(/&amp;/gu, "&")
    .replace(/\\u0026/giu, "&")
    .replace(/\\u003d/giu, "=");
}

function extract(text: string): string[] {
  const normalized = normalize(text);
  IMAGE_URL_PATTERN.lastIndex = 0;
  return Array.from(normalized.matchAll(IMAGE_URL_PATTERN))
    .map((match) => match[0])
    .filter((url) => /alicdn|ibank|O1CN|cbu01/i.test(url));
}

function emit(urls: string[]): void {
  if (urls.length === 0) {
    return;
  }
  window.postMessage(
    { source: "kuajing-image-page-hook", type: "kuajing-image:captured-urls", urls },
    window.location.origin
  );
}

function inspectText(text: string): void {
  if (!text || !/alicdn|ibank|O1CN|cbu01|offer_details|img\/ibank/i.test(String(text))) {
    return;
  }
  emit(extract(text));
}

if (!(window as Window & { __kuajingImagePageHookInstalled?: boolean }).__kuajingImagePageHookInstalled) {
  (window as Window & { __kuajingImagePageHookInstalled?: boolean }).__kuajingImagePageHookInstalled = true;

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      try {
        const clone = response.clone();
        const contentType = clone.headers.get("content-type") || "";
        if (/json|javascript|text|html/i.test(contentType)) {
          clone.text().then(inspectText).catch(() => {});
        }
      } catch {}
      return response;
    };
  }

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    this: HookedXMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ) {
    this.__kuajingImageRequestUrl = url;
    return originalOpen.call(this, method, url, async ?? true, username, password);
  };
  XMLHttpRequest.prototype.send = function (this: HookedXMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener("load", function () {
      try {
        const responseType = this.responseType || "";
        const contentType = this.getResponseHeader("content-type") || "";
        if ((!responseType || responseType === "text") && /json|javascript|text|html/i.test(contentType)) {
          inspectText(this.responseText || "");
        }
      } catch {}
    });
    return originalSend.call(this, body);
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof HTMLScriptElement) {
          inspectText(node.textContent || "");
          if (node.src) emit([node.src]);
        } else if (node instanceof HTMLElement) {
          inspectText(node.outerHTML || "");
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  inspectText(document.documentElement?.outerHTML || "");
  for (const scriptNode of Array.from(document.scripts)) {
    inspectText(scriptNode.textContent || "");
    if (scriptNode.src) emit([scriptNode.src]);
  }
}
interface HookedXMLHttpRequest extends XMLHttpRequest {
  __kuajingImageRequestUrl?: string | URL;
}
