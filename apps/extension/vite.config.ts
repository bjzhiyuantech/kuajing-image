import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

function extensionApiBaseUrl(): string {
  const target = process.env.EXTENSION_BUILD_TARGET === "dev" ? "dev" : "prod";
  const env = loadEnv("", resolve(__dirname, "../.."), "");
  const processBaseUrl =
    target === "dev" ? process.env.EXTENSION_DEV_API_BASE_URL || process.env.VITE_EXTENSION_API_BASE_URL : process.env.EXTENSION_PROD_API_BASE_URL || process.env.VITE_EXTENSION_API_BASE_URL;
  return target === "dev"
    ? processBaseUrl || env.EXTENSION_DEV_API_BASE_URL || "https://dev.neimou.com"
    : processBaseUrl || env.EXTENSION_PROD_API_BASE_URL || "https://ai.neimou.com";
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
        entryFileNames: (chunk) => (chunk.name === "background" || chunk.name === "content-script" || chunk.name === "page-hook" ? "[name].js" : "assets/[name]-[hash].js")
      }
    }
  }
});
