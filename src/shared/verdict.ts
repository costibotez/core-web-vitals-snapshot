import { THRESHOLDS } from "./constants";
import type {
  MetricName,
  MetricReading,
  MetricStatus,
  OverallVerdict,
  VerdictSnapshot,
} from "./types";

export function classify(metric: MetricName, value: number | null): MetricStatus {
  if (value === null) return "pending";
  const t = THRESHOLDS[metric];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "needs-improvement";
  return "poor";
}

export function formatValue(metric: MetricName, value: number | null): string {
  if (value === null) return "–";
  if (metric === "CLS") return value.toFixed(2);
  return `${(value / 1000).toFixed(1)}s`;
}

export function formatThresholdGood(metric: MetricName): string {
  const t = THRESHOLDS[metric];
  return metric === "CLS" ? `${t.good}` : `${t.good / 1000}s`;
}

/**
 * The status a metric is judged on. CrUX wins over the live reading when both
 * exist and disagree, because CrUX is what Google actually uses for ranking.
 */
export function effectiveStatus(reading: MetricReading): MetricStatus {
  if (reading.cruxStatus !== "no-data" && reading.cruxStatus !== "pending") {
    return reading.cruxStatus;
  }
  return reading.liveStatus;
}

/** Human names used inside sentences — never bare acronyms. */
const HUMAN_NAME: Record<MetricName, string> = {
  LCP: "Loading",
  CLS: "Stability",
  INP: "Responsiveness",
};

export function humanName(metric: MetricName): string {
  return HUMAN_NAME[metric];
}

/**
 * Plain-English sentence for the collapsed row. Written for Sarah: no jargon,
 * no alarm language on amber ("worth attention", never warnings).
 */
export function sentenceFor(reading: MetricReading): string {
  const status = effectiveStatus(reading);
  const value =
    reading.cruxStatus !== "no-data" && reading.cruxP75 !== null
      ? reading.cruxP75
      : reading.liveValue;

  switch (reading.metric) {
    case "LCP": {
      const v = value === null ? null : formatValue("LCP", value);
      if (status === "pending") return "Measuring how fast your page appears…";
      if (status === "good")
        return `Your page's main content appears in ${v}. That's fast — Google is happy.`;
      if (status === "needs-improvement")
        return `Your biggest image or heading takes ${v} to appear. Google wants under 2.5s — worth attention.`;
      return `Your biggest image or heading takes ${v} to appear. Google wants under 2.5 seconds.`;
    }
    case "CLS": {
      const v = value === null ? null : formatValue("CLS", value);
      if (status === "pending") return "Watching whether things jump around while loading…";
      if (status === "good")
        return "Nothing jumps around while your page loads. Visitors can tap without missing.";
      if (status === "needs-improvement")
        return `Things shift a little while loading (score ${v}). Worth attention before it annoys visitors.`;
      return `Buttons and text jump around while loading (score ${v}). Visitors tap the wrong thing.`;
    }
    case "INP": {
      const v = value === null ? null : formatValue("INP", value);
      if (status === "pending")
        return "Waiting for you to interact with the page — click or tap anything.";
      if (status === "good")
        return "Your page reacts instantly when visitors click or type.";
      if (status === "needs-improvement")
        return `Your page takes ${v} to react to clicks. Google wants under 0.2s — worth attention.`;
      return `Your page takes ${v} to react when visitors click. It feels frozen.`;
    }
  }
}

/**
 * Overall verdict: any poor metric (live or CrUX) → at-risk; any
 * needs-improvement with no poor → needs-attention; otherwise healthy.
 */
export function overallVerdict(metrics: MetricReading[]): OverallVerdict {
  const statuses = metrics.flatMap((m) => {
    const s: MetricStatus[] = [];
    if (m.liveStatus !== "pending") s.push(m.liveStatus);
    if (m.cruxStatus !== "no-data" && m.cruxStatus !== "pending") s.push(m.cruxStatus);
    return s;
  });
  if (statuses.includes("poor")) return "at-risk";
  if (statuses.includes("needs-improvement")) return "needs-attention";
  return "healthy";
}

export const VERDICT_LABEL: Record<OverallVerdict, string> = {
  healthy: "Healthy",
  "needs-attention": "Needs attention",
  "at-risk": "At risk",
};

export const VERDICT_SENTENCE: Record<OverallVerdict, string> = {
  healthy: "This site is fast enough for Google and your visitors. Nothing to fix.",
  "needs-attention": "This site works, but a couple of things are worth attention.",
  "at-risk": "Something here is slow enough to cost visitors and rankings.",
};

/** One-sentence explanation when the live reading and CrUX disagree. */
export function disagreementNote(reading: MetricReading): string | null {
  if (
    reading.liveStatus === "pending" ||
    reading.cruxStatus === "no-data" ||
    reading.cruxStatus === "pending" ||
    reading.liveStatus === reading.cruxStatus
  ) {
    return null;
  }
  const liveBetter =
    rank(reading.liveStatus) < rank(reading.cruxStatus as MetricStatus);
  return liveBetter
    ? "Your visit was faster than what most real visitors get — Google judges by their experience, so that's the one that counts."
    : "Your visit was slower than what most real visitors get — Google judges by their experience over 28 days.";
}

function rank(s: MetricStatus): number {
  return s === "good" ? 0 : s === "needs-improvement" ? 1 : 2;
}

export function buildSnapshot(
  origin: string,
  metrics: MetricReading[],
  cruxCollectionPeriod: string | null,
): VerdictSnapshot {
  return {
    origin,
    checkedAt: new Date().toISOString(),
    overall: overallVerdict(metrics),
    metrics,
    cruxCollectionPeriod,
  };
}
