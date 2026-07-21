import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

// Main build: popup, options page and service worker via crxjs.
// The content script is built separately (vite.content.config.ts) as a
// classic IIFE so chrome.scripting.executeScript can inject it as-is.
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
  },
});
