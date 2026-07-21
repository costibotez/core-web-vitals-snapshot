/**
 * Renders the branded 1200x630 result card on an offscreen canvas and copies
 * the PNG to the clipboard. Runs entirely in the popup — nothing is uploaded.
 */
import { COLORS } from "../shared/constants";
import type { MetricStatus, VerdictSnapshot } from "../shared/types";
import { effectiveStatus, formatThresholdGood, formatValue, VERDICT_LABEL } from "../shared/verdict";

const W = 1200;
const H = 630;

const STATUS_COLOR: Record<Exclude<MetricStatus, "pending">, string> = {
  good: COLORS.statusPass,
  "needs-improvement": COLORS.statusWarn,
  poor: COLORS.statusFail,
};

const VERDICT_COLOR = {
  healthy: COLORS.statusPass,
  "needs-attention": COLORS.statusWarn,
  "at-risk": COLORS.statusFail,
} as const;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export async function renderResultCard(snapshot: VerdictSnapshot): Promise<Blob> {
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = COLORS.surfaceDark;
  ctx.fillRect(0, 0, W, H);

  // Subtle top accent line in brand orange (action color, decorative here)
  ctx.fillStyle = COLORS.brandPrimary;
  ctx.fillRect(0, 0, W, 6);

  const domain = new URL(snapshot.origin).hostname.replace(/^www\./, "");
  const date = new Date(snapshot.checkedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Domain + date
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "600 44px Sora, Inter, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(fitText(ctx, domain, W - 160), 80, 118);
  ctx.fillStyle = "#8593a8";
  ctx.font = "400 24px Inter, sans-serif";
  ctx.fillText(`Checked ${date}`, 80, 158);

  // Overall verdict pill
  const verdictColor = VERDICT_COLOR[snapshot.overall];
  const verdictText = VERDICT_LABEL[snapshot.overall];
  ctx.font = "600 34px Sora, Inter, sans-serif";
  const pillW = ctx.measureText(verdictText).width + 96;
  const pillX = 80;
  const pillY = 196;
  ctx.fillStyle = hexToRgba(verdictColor, 0.15);
  roundRect(ctx, pillX, pillY, pillW, 68, 34);
  ctx.fill();
  ctx.strokeStyle = verdictColor;
  ctx.lineWidth = 2;
  roundRect(ctx, pillX, pillY, pillW, 68, 34);
  ctx.stroke();
  // status dot (shape + color)
  ctx.fillStyle = verdictColor;
  ctx.beginPath();
  ctx.arc(pillX + 40, pillY + 34, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = verdictColor;
  ctx.fillText(verdictText, pillX + 66, pillY + 46);

  // Metric chips row
  const chipY = 330;
  const chipW = 330;
  const chipH = 148;
  const gap = 25;
  snapshot.metrics.forEach((m, i) => {
    const x = 80 + i * (chipW + gap);
    const status = effectiveStatus(m);
    const color = status === "pending" ? "#8593a8" : STATUS_COLOR[status];
    const value =
      m.cruxP75 !== null ? m.cruxP75 : m.liveValue !== null ? m.liveValue : null;

    ctx.fillStyle = "#222d40";
    roundRect(ctx, x, chipY, chipW, chipH, 16);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(color, 0.5);
    ctx.lineWidth = 2;
    roundRect(ctx, x, chipY, chipW, chipH, 16);
    ctx.stroke();

    ctx.fillStyle = "#b6c0cf";
    ctx.font = "500 24px Inter, sans-serif";
    ctx.fillText(m.metric, x + 28, chipY + 48);

    ctx.fillStyle = color;
    ctx.font = "600 52px Sora, Inter, sans-serif";
    ctx.fillText(
      value === null ? "–" : formatValue(m.metric, value),
      x + 28,
      chipY + 112,
    );

    // small status dot
    ctx.beginPath();
    ctx.arc(x + chipW - 34, chipY + 40, 9, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });

  // Thresholds reference — shrink to fit the card width if needed
  ctx.fillStyle = "#8593a8";
  const thresholdText = `Measured against Google's official Core Web Vitals thresholds · LCP < ${formatThresholdGood("LCP")} · CLS < ${formatThresholdGood("CLS")} · INP < ${formatThresholdGood("INP")}`;
  for (const size of [22, 20, 18]) {
    ctx.font = `400 ${size}px Inter, sans-serif`;
    if (ctx.measureText(thresholdText).width <= W - 160) break;
  }
  ctx.fillText(thresholdText, 80, 536);

  // Footer
  ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, 566);
  ctx.lineTo(W - 80, 566);
  ctx.stroke();
  ctx.fillStyle = "#b6c0cf";
  ctx.font = "500 22px Inter, sans-serif";
  ctx.fillText("Checked with Core Web Vitals Snapshot by Nomad Developer", 80, 604);
  ctx.fillStyle = COLORS.brandPrimary;
  const brandText = "nomad-developer.co.uk";
  const brandW = ctx.measureText(brandText).width;
  ctx.fillText(brandText, W - 80 - brandW, 604);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 4 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

export async function copyResultCard(snapshot: VerdictSnapshot): Promise<void> {
  const blob = await renderResultCard(snapshot);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
