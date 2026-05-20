const api = require("./api");
const { SCENES } = require("./constants");

const SCENE_LABELS = SCENES.reduce((labels, scene) => {
  labels[scene.id] = scene.label;
  return labels;
}, {});

function galleryDisplayImage(item, options = {}) {
  const asset = item.asset || {};
  const assetUrl = asset.url || (asset.id ? `/api/assets/${asset.id}` : "");
  const displayUrl = assetDisplayUrl(asset, assetUrl, options.preferredWidth || 512);
  if (!displayUrl) return null;
  const url = imageDisplayUrl(displayUrl, {
    appendToken: options.appendToken,
    baseUrl: options.baseUrl,
    token: options.token
  });
  if (!url) return null;
  return {
    id: item.outputId || asset.id || displayUrl,
    url,
    prompt: workPrompt(item),
    tag: workTag(item)
  };
}

function assetDisplayUrl(asset, fallbackUrl, preferredWidth) {
  const previewUrls = asset.cdnPreviewUrls || asset.cdn_preview_urls || {};
  return previewUrlForWidth(previewUrls, preferredWidth) || asset.cdnUrl || asset.cdn_url || fallbackUrl || "";
}

function previewUrlForWidth(previewUrls, preferredWidth) {
  const widths = Object.keys(previewUrls || {})
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const selectedWidth = widths.find((width) => width >= preferredWidth) || widths[widths.length - 1];
  return selectedWidth ? previewUrls[String(selectedWidth)] : "";
}

function imageDisplayUrl(url, options = {}) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const baseUrl = options.baseUrl || api.getBaseUrl();
  const token = typeof options.token === "string" ? options.token : api.getToken();
  const shouldAppendToken = options.appendToken !== false && token && !url.startsWith("/api/public/");
  return `${baseUrl}${url}${shouldAppendToken ? `${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : ""}`;
}

function workPrompt(item) {
  return String(item.prompt || item.effectivePrompt || "平台公开作品").trim();
}

function workTag(item) {
  const preset = String(item.presetId || "").trim();
  if (preset) return SCENE_LABELS[preset] || preset;
  const mode = String(item.mode || "").trim();
  return mode || item.userDisplayName || "官方案例";
}

function formatCompactTime(value) {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 16);
}

function publicWorkKey(item) {
  return item.outputId || (item.asset && item.asset.id) || (item.asset && item.asset.url) || item.createdAt || JSON.stringify(item);
}

function saveImageUrlToAlbum(url) {
  if (!url) {
    return Promise.reject(new Error("没有可保存的图片"));
  }
  if (!/^https?:\/\//i.test(url)) {
    return saveLocalImage(url);
  }
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          saveLocalImage(res.tempFilePath).then(resolve).catch(reject);
          return;
        }
        reject(new Error(`图片下载失败（HTTP ${res.statusCode}）`));
      },
      fail(error) {
        reject(new Error(error.errMsg || "图片下载失败"));
      }
    });
  });
}

function saveLocalImage(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: resolve,
      fail(error) {
        reject(new Error(saveAlbumErrorMessage(error)));
      }
    });
  });
}

function saveAlbumErrorMessage(error) {
  const message = (error && error.errMsg) || "";
  if (message.includes("auth deny") || message.includes("authorize no response") || message.includes("scope.writePhotosAlbum")) {
    return "保存失败，请在小程序设置中允许保存到相册";
  }
  return message || "保存失败，请检查相册权限";
}

module.exports = {
  formatCompactTime,
  galleryDisplayImage,
  imageDisplayUrl,
  publicWorkKey,
  saveImageUrlToAlbum,
  workPrompt,
  workTag
};
