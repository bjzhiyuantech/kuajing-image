const IMAGE_URL_PATTERN = /(?:https?:)?\/\/[^"'()<>\s\\]+?\.(?:jpg|jpeg|png|webp|gif|bmp|avif)(?:[._!-][^"'()<>\s\\?]*)?(?:\?[^"'()<>\s\\]*)?/giu;

function normalize(value) {
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

function extractUrls(value) {
  IMAGE_URL_PATTERN.lastIndex = 0;
  return Array.from(normalize(value).matchAll(IMAGE_URL_PATTERN)).map((match) => match[0]);
}

function add(found, source, text) {
  for (const url of extractUrls(text)) {
    if (/alicdn|ibank|O1CN|cbu01/i.test(url)) {
      found.push({ source, url });
    }
  }
}

function scanWindow(found) {
  for (const key of Object.keys(window).slice(0, 3000)) {
    if (!/offer|detail|desc|product|image|img|data|apollo|redux|__|mod/i.test(key)) {
      continue;
    }
    try {
      const value = window[key];
      if (typeof value === "string") {
        add(found, `window.${key}`, value);
      } else if (value && typeof value === "object") {
        const json = JSON.stringify(value);
        if (json) {
          add(found, `window.${key}`, json);
        }
      }
    } catch {
      // Ignore unreadable globals.
    }
  }
}

function scanDom(found) {
  document.querySelectorAll("*").forEach((el, index) => {
    for (const attr of Array.from(el.attributes || [])) {
      if (/src|image|img|url|lazy|original|data/i.test(attr.name) || /alicdn|ibank|O1CN|jpg|webp/i.test(attr.value)) {
        add(found, `attr ${index} ${el.tagName}.${attr.name}`, attr.value);
      }
    }
  });
  add(found, "documentElement.outerHTML", document.documentElement.outerHTML);
}

function scanScripts(found) {
  for (const [index, script] of Array.from(document.scripts).entries()) {
    add(found, `script ${index} ${script.src || "inline"}`, script.textContent || script.src || "");
  }
}

function scanResources(found) {
  for (const [index, resource] of performance.getEntriesByType("resource").entries()) {
    add(found, `resource ${index} ${resource.initiatorType}`, resource.name);
  }
}

const found = [];
scanDom(found);
scanScripts(found);
scanResources(found);
scanWindow(found);

const unique = [...new Map(found.map((item) => [item.url, item])).values()];
console.log(`found ${unique.length}`);
console.log(JSON.stringify(unique, null, 2));
