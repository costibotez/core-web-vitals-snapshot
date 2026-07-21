import type { MetricName } from "./types";

/** Google's official Core Web Vitals thresholds — the only source of truth. */
export const THRESHOLDS: Record<MetricName, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 }, // ms
  CLS: { good: 0.1, poor: 0.25 }, // unitless
  INP: { good: 200, poor: 500 }, // ms
};

export const CRUX_ENDPOINT =
  "https://chromeuxreport.googleapis.com/v1/records:queryRecord";

/** CrUX responses are cached per origin for 24h to stay far under quota. */
export const CRUX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const MAX_RECENT_CHECKS = 5;

export const SITE_URL = "https://www.nomad-developer.co.uk";
export const WHAT_IT_MEANS_URL = `${SITE_URL}/tools/core-web-vitals-snapshot/what-it-means`;
export const UTM_SUFFIX = "utm_source=extension&utm_medium=fix-cta";

/** Design tokens shared with the landing page Tailwind config. */
export const COLORS = {
  brandPrimary: "#ff7a18", // action only, never status
  surfaceDark: "#1a2332",
  surfaceLight: "#f4f5f7",
  statusPass: "#22c55e",
  statusWarn: "#f59e0b",
  statusFail: "#ef4444",
} as const;
