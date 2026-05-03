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
        installHelp: resolve(__dirname, "install-help.html"),
        background: resolve(__dirname, "src/background.ts"),
        "content-script": resolve(__dirname, "src/content-script.ts")
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "background" || chunk.name === "content-script" ? "[name].js" : "assets/[name]-[hash].js")
      }
    }
  }
});
