export type MetricName = "LCP" | "CLS" | "INP";

export type MetricStatus = "good" | "needs-improvement" | "poor" | "pending";

export interface MetricReading {
  metric: MetricName;
  /** ms for LCP/INP, unitless for CLS. null until measured. */
  liveValue: number | null;
  liveStatus: MetricStatus;
  /** CrUX p75 for the origin; ms for LCP/INP, unitless for CLS. */
  cruxP75: number | null;
  cruxStatus: MetricStatus | "no-data";
  /** Plain-English one-liner shown collapsed; generated from status. */
  sentence: string;
}

export type OverallVerdict = "healthy" | "needs-attention" | "at-risk";

export interface VerdictSnapshot {
  origin: string; // "https://example.com"
  checkedAt: string; // ISO timestamp
  overall: OverallVerdict;
  metrics: MetricReading[];
  cruxCollectionPeriod: string | null;
}

/** Message posted by the injected measurement script for each metric update. */
export interface LiveMetricMessage {
  type: "cwv-live-metric";
  metric: MetricName;
  value: number;
}

export interface CruxResult {
  status: "ok" | "no-data" | "error";
  p75: Partial<Record<MetricName, number>>;
  collectionPeriod: string | null;
}

export interface Settings {
  /** Show the verdict as a colored badge on the toolbar icon after a check. */
  badgeEnabled: boolean;
}
