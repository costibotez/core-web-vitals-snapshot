import type { MetricName } from "./types";

/**
 * Plain-English explainers shown inside the expanded metric row. Written for
 * a non-technical owner: what it is, why it matters, what usually causes it.
 */
export const EXPLAINERS: Record<MetricName, { what: string; why: string }> = {
  LCP: {
    what: "Loading speed (LCP) measures how long the biggest thing on your page — usually a photo or headline — takes to show up.",
    why: "Slow loading is usually caused by large images, a slow host, or too many plugins. Visitors give up after a few seconds, and Google ranks slower sites lower.",
  },
  CLS: {
    what: "Visual stability (CLS) measures whether things on the page jump around while it loads.",
    why: "Jumping content makes people tap the wrong button — often caused by images without set sizes, ads, or banners that push everything down.",
  },
  INP: {
    what: "Responsiveness (INP) measures how quickly the page reacts when someone clicks, taps or types.",
    why: "A sluggish page feels broken even if it looks fine. It is usually caused by heavy scripts doing too much work at once.",
  },
};
