import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
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
