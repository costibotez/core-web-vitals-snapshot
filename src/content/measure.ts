/**
 * Injected into the active tab via chrome.scripting.executeScript when the
 * user opens the popup (activeTab grant — never runs without that gesture).
 *
 * Uses the official web-vitals library (attribution build). Because the
 * library registers PerformanceObservers with `buffered: true`, injecting
 * *after* page load still recovers the full LCP / CLS / INP history of the
 * visit. INP only reports once the user has actually interacted.
 *
 * Re-injection (popup reopened on the same page) is guarded: the first run
 * keeps observers alive and caches the latest values on window; later runs
 * just replay the cache.
 */
import { onLCP, onCLS, onINP } from "web-vitals/attribution";

type MetricName = "LCP" | "CLS" | "INP";

declare global {
  interface Window {
    __cwvSnapshot?: {
      latest: Partial<Record<MetricName, number>>;
    };
  }
}

function report(metric: MetricName, value: number): void {
  const state = window.__cwvSnapshot;
  if (state) state.latest[metric] = value;
  try {
    chrome.runtime.sendMessage({ type: "cwv-live-metric", metric, value });
  } catch {
    // Popup closed and worker asleep — values stay cached on window for the
    // next injection; nothing to do.
  }
}

if (window.__cwvSnapshot) {
  // Already measuring: replay cached values so the fresh popup fills instantly.
  const { latest } = window.__cwvSnapshot;
  (Object.keys(latest) as MetricName[]).forEach((m) => report(m, latest[m]!));
} else {
  window.__cwvSnapshot = { latest: {} };
  const opts = { reportAllChanges: true };
  onLCP((m) => report("LCP", m.value), opts);
  onCLS((m) => report("CLS", m.value), opts);
  onINP((m) => report("INP", m.value), opts);
}

export {};
