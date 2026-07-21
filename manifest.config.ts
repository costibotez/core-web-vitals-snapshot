import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

/**
 * Permission rationale (privacy is a marketed feature — keep this minimal):
 * - activeTab: measurement only ever runs on the tab the user explicitly
 *   clicked the toolbar icon on. No content script is declared in the
 *   manifest, so there is no "read data on all websites" install warning.
 * - scripting: needed to inject the measurement script into the active tab
 *   after the user gesture grants activeTab.
 * - storage: session history (last 5 checks) and the 24h CrUX cache live in
 *   chrome.storage.session; the badge preference lives in chrome.storage.local.
 * - host_permissions: only the CrUX API endpoint. Nothing else ever leaves
 *   the browser, and no analytics run anywhere in the extension.
 */
export default defineManifest({
  manifest_version: 3,
  name: "Core Web Vitals Snapshot",
  version: pkg.version,
  description:
    "Is your site fast enough for Google? A one-click, plain-English Core Web Vitals verdict. Free, no account, nothing leaves your browser.",
  icons: {
    16: "icons/icon-16.png",
    32: "icons/icon-32.png",
    48: "icons/icon-48.png",
    128: "icons/icon-128.png",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Check Core Web Vitals",
  },
  options_page: "src/options/index.html",
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  permissions: ["activeTab", "scripting", "storage"],
  host_permissions: ["https://chromeuxreport.googleapis.com/*"],
  web_accessible_resources: [
    {
      // The measurement script is injected programmatically via
      // chrome.scripting.executeScript, so it must be reachable in dist.
      resources: ["content/measure.js"],
      matches: ["<all_urls>"],
    },
  ],
});
