# Photoshop Workflow MVP

This MVP does not ask `gpt-image-2` for PSD output. The API creates a small Photoshop package from an existing generated asset:

- `manifest.json`
- `*.psd`
- `ai-composite.png`
- layer PNG files, depending on the selected strategy

The PSD writer is adapted from the `bggg-creator-image2psd` approach: it writes a basic 8-bit RGB PSD directly from backend buffers, including raster layer records, alpha channels, Unicode layer names, and a flattened composite preview. It does not require Photoshop, ImageMagick, or a desktop worker.

Layer strategies:

- `alpha-channel`: use existing alpha as the subject mask.
- `edge-background`: remove a simple edge-sampled background.
- `design-elements`: extract high-contrast top-area text/logo copy into one transparent raster layer and clean the background below it.
- `color-clusters`: split a flat image into dominant-color transparent raster layers, similar to `bggg-creator-image2psd split-colors`.
- `flat`: fallback to background/product/composite duplicate layers.

`design-elements` is the preferred flat-image MVP strategy because it produces fewer, more design-like layers than raw color clustering. It is still heuristic raster extraction: it does not recover editable text layers, vector icons, or original source elements. Commercial-quality layer recovery needs OCR + object/region segmentation + real inpainting.

## Create Package

Authenticated request:

```bash
curl -X POST http://127.0.0.1:8787/api/photoshop/packages \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <app-token>' \
  -d '{"assetId":"<generated-asset-id>","packageName":"demo-product"}'
```

Response:

```json
{
  "packageId": "example",
  "manifestUrl": "http://127.0.0.1:8787/api/photoshop/packages/example/manifest.json?token=...",
  "expiresAt": "2026-05-18T12:00:00.000Z",
  "manifest": {
    "version": 1,
    "psd": {
      "fileName": "demo-product.psd",
      "url": "http://127.0.0.1:8787/api/photoshop/packages/example/demo-product.psd?token=..."
    },
    "workflow": {
      "kind": "photoshop-mvp",
      "layerStrategy": "design-elements",
      "notes": []
    },
    "layers": []
  }
}
```

## Photoshop Plugin Consumption

The Photoshop UXP plugin can use either the native PSD file or the PNG layer manifest.

Native PSD path:

1. Fetch `manifestUrl`.
2. Download `manifest.psd.url`.
3. Open the PSD in Photoshop.

PNG layer fallback:

1. Fetch `manifestUrl`.
2. Create a Photoshop document using `manifest.canvas.width` and `manifest.canvas.height`.
3. Fetch each `manifest.layers[].url`.
4. Place the PNGs into the document in array order.
5. Rename layers with `manifest.layers[].name`.
6. Apply `manifest.layers[].visible` if the plugin creates layers manually.
7. Save as `manifest.recommendedDocumentName`.

The package URLs include a 24-hour token so the plugin does not need the web app login cookie.
