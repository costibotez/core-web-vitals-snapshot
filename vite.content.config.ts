import { defineConfig } from "vite";

// Second build pass: the injected measurement script. Content scripts run in
// an isolated world without module support when injected via
// chrome.scripting.executeScript, so this must be a single classic IIFE file.
export default defineConfig({
  build: {
    // Built into public/ so the main crxjs pass (which runs second) both
    // validates the web_accessible_resources entry and copies it into dist.
    outDir: "public",
    copyPublicDir: false,
    emptyOutDir: false,
    target: "es2022",
    lib: {
      entry: "src/content/measure.ts",
      formats: ["iife"],
      name: "cwvSnapshotMeasure",
      fileName: () => "content/measure.js",
    },
  },
});
