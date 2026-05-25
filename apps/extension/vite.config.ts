import { createRequire } from "node:module";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const require = createRequire(import.meta.url);
const serviceDomains = require("../../config/service-domains.json") as {
  localApiBaseUrl: string;
  devApiBaseUrl: string;
  prodApiBaseUrl: string;
};

function extensionApiBaseUrl(): string {
  const rawTarget = process.env.EXTENSION_BUILD_TARGET;
  const target = rawTarget === "dev" || rawTarget === "prod" ? rawTarget : "local";
  const env = loadEnv("", resolve(__dirname, "../.."), "");
  const processBaseUrl =
    target === "local"
      ? process.env.EXTENSION_LOCAL_API_BASE_URL || process.env.VITE_EXTENSION_API_BASE_URL
      : target === "dev"
        ? process.env.EXTENSION_DEV_API_BASE_URL || process.env.VITE_EXTENSION_API_BASE_URL
        : process.env.EXTENSION_PROD_API_BASE_URL || process.env.VITE_EXTENSION_API_BASE_URL;
  return target === "local"
    ? processBaseUrl || env.EXTENSION_LOCAL_API_BASE_URL || serviceDomains.localApiBaseUrl
    : target === "dev"
      ? processBaseUrl || env.EXTENSION_DEV_API_BASE_URL || serviceDomains.devApiBaseUrl
      : processBaseUrl || env.EXTENSION_PROD_API_BASE_URL || serviceDomains.prodApiBaseUrl;
}

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_EXTENSION_API_BASE_URL": JSON.stringify(extensionApiBaseUrl())
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "index.html"),
        background: resolve(__dirname, "src/background.ts"),
        "content-script": resolve(__dirname, "src/content-script.ts"),
        "page-hook": resolve(__dirname, "src/page-hook.ts")
      },
      output: {
        entryFileNames: (chunk: { name: string }) =>
          chunk.name === "background" || chunk.name === "content-script" || chunk.name === "page-hook" ? "[name].js" : "assets/[name]-[hash].js"
      }
    }
  }
});
