/**
 * Dev-only mock so the popup can be previewed in a plain browser tab
 * (`npm run dev`) without extension APIs. Never shipped in the real flow:
 * it only activates when chrome.runtime is absent.
 */
import type { CruxResult, VerdictSnapshot } from "../shared/types";

export function isExtensionContext(): boolean {
  return typeof chrome !== "undefined" && !!chrome.runtime?.id;
}

const mockCrux: CruxResult = {
  status: "ok",
  p75: { LCP: 4100, CLS: 0.05, INP: 310 },
  collectionPeriod: "22 Jun 2026 – 19 Jul 2026",
};

const mockHistory: VerdictSnapshot[] = [
  {
    origin: "https://sarahs-homeware.co.uk",
    checkedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    overall: "at-risk",
    metrics: [],
    cruxCollectionPeriod: null,
  },
  {
    origin: "https://competitor-shop.com",
    checkedAt: new Date(Date.now() - 21 * 60_000).toISOString(),
    overall: "healthy",
    metrics: [],
    cruxCollectionPeriod: null,
  },
];

export function installDevMock(): void {
  if (isExtensionContext()) return;

  const listeners: Array<(msg: unknown) => void> = [];

  const mock = {
    runtime: {
      id: undefined,
      onMessage: {
        addListener: (fn: (msg: unknown) => void) => listeners.push(fn),
      },
      sendMessage: (msg: { type: string; [k: string]: unknown }) => {
        switch (msg.type) {
          case "inject-measure":
            // Simulate live metrics arriving progressively.
            setTimeout(() => listeners.forEach((l) => l({ type: "cwv-live-metric", metric: "LCP", value: 3350 })), 500);
            setTimeout(() => listeners.forEach((l) => l({ type: "cwv-live-metric", metric: "CLS", value: 0.04 })), 700);
            return Promise.resolve({ ok: true });
          case "fetch-crux":
            return new Promise((r) => setTimeout(() => r(mockCrux), 900));
          case "get-history":
            return Promise.resolve(mockHistory);
          case "save-snapshot":
          case "clear-history":
          case "set-settings":
            return Promise.resolve({ ok: true });
          case "get-settings":
            return Promise.resolve({ badgeEnabled: true });
          default:
            return Promise.resolve(undefined);
        }
      },
    },
    tabs: {
      query: () =>
        Promise.resolve([
          { id: 1, url: "https://sarahs-homeware.co.uk/shop", title: "Sarah's Homeware" },
        ]),
    },
  };

  (globalThis as Record<string, unknown>).chrome = mock;
}
