import "./popup.css";
import { installDevMock } from "./chrome-dev-mock";
import { EXPLAINERS } from "../shared/explainers";
import { WHAT_IT_MEANS_URL, UTM_SUFFIX } from "../shared/constants";
import type {
  CruxResult,
  MetricName,
  MetricReading,
  MetricStatus,
  VerdictSnapshot,
} from "../shared/types";
import {
  buildSnapshot,
  classify,
  disagreementNote,
  effectiveStatus,
  formatValue,
  humanName,
  sentenceFor,
  VERDICT_LABEL,
  VERDICT_SENTENCE,
} from "../shared/verdict";
import { copyResultCard } from "./result-card";

installDevMock();

const METRICS: MetricName[] = ["LCP", "CLS", "INP"];

interface State {
  mode: "live" | "restored" | "unsupported";
  origin: string | null;
  tabId: number | null;
  live: Partial<Record<MetricName, number>>;
  crux: CruxResult | null; // null while loading
  settled: boolean;
  expanded: Set<MetricName>;
  sourceOpen: boolean;
  restored: VerdictSnapshot | null;
  history: VerdictSnapshot[];
  exportState: "idle" | "rendering" | "copied" | "error";
}

const state: State = {
  mode: "live",
  origin: null,
  tabId: null,
  live: {},
  crux: null,
  settled: false,
  expanded: new Set(),
  sourceOpen: false,
  restored: null,
  history: [],
  exportState: "idle",
};

const app = document.getElementById("app")!;
const toastEl = document.getElementById("toast")!;
const liveRegion = document.getElementById("live-region")!;

/* ---------------- helpers ---------------- */

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function domainOf(origin: string): string {
  try {
    return new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return origin;
  }
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

/** Assemble the three MetricReadings from current live + CrUX state. */
function currentReadings(): MetricReading[] {
  return METRICS.map((metric) => {
    const liveValue = state.live[metric] ?? null;
    const cruxP75 =
      state.crux?.status === "ok" ? (state.crux.p75[metric] ?? null) : null;
    const reading: MetricReading = {
      metric,
      liveValue,
      liveStatus: classify(metric, liveValue),
      cruxP75,
      cruxStatus:
        cruxP75 !== null ? classify(metric, cruxP75) : state.crux ? "no-data" : "pending",
      sentence: "",
    };
    reading.sentence = sentenceFor(reading);
    return reading;
  });
}

function currentSnapshot(): VerdictSnapshot | null {
  if (state.mode === "restored" && state.restored) return state.restored;
  if (!state.origin) return null;
  return buildSnapshot(
    state.origin,
    currentReadings(),
    state.crux?.collectionPeriod ?? null,
  );
}

function isSettled(): boolean {
  return state.mode === "restored" || state.settled;
}

/* ---------------- icons (shape + color, never color alone) ---------------- */

const ICON_CHECK = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.6"/><path d="M5 8.2 7.2 10.4 11 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_WARN = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2 14.5 13.5H1.5L8 2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 6.5v3M8 11.6v.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICON_FAIL = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="m5.8 5.8 4.4 4.4M10.2 5.8l-4.4 4.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const ICON_PULSE = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 3"/></svg>`;
const ICON_CHEVRON = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m2.5 4.5 3.5 3.5 3.5-3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function statusIcon(status: MetricStatus | "no-data"): string {
  if (status === "good") return ICON_CHECK;
  if (status === "needs-improvement") return ICON_WARN;
  if (status === "poor") return ICON_FAIL;
  return ICON_PULSE;
}

const STATUS_WORD: Record<MetricStatus, string> = {
  good: "Good",
  "needs-improvement": "Worth attention",
  poor: "Failing",
  pending: "Measuring",
};

/* ---------------- render ---------------- */

function render(): void {
  if (state.mode === "unsupported") {
    app.innerHTML = `
      ${renderHeader()}
      <div class="unsupported">
        <h2>Nothing to measure here</h2>
        <p>Open a normal website tab (like your own site) and click the icon again.</p>
      </div>
      ${renderRecent()}`;
    bind();
    return;
  }

  const snapshot = currentSnapshot();
  const readings = snapshot?.metrics.length ? snapshot.metrics : currentReadings();
  const settled = isSettled();
  const overall = snapshot?.overall ?? "healthy";
  const domain = state.mode === "restored" && state.restored
    ? domainOf(state.restored.origin)
    : state.origin
      ? domainOf(state.origin)
      : "";

  const verdictClass = settled ? `verdict--${overall}` : "verdict--measuring";
  const verdictIcon = !settled
    ? ICON_PULSE
    : overall === "healthy"
      ? ICON_CHECK
      : overall === "needs-attention"
        ? ICON_WARN
        : ICON_FAIL;
  const verdictLabel = settled ? VERDICT_LABEL[overall] : "Measuring…";
  const verdictSentence = settled
    ? VERDICT_SENTENCE[overall]
    : "Reading this page the way Google does. Takes a moment.";

  app.innerHTML = `
    ${renderHeader()}
    ${state.mode === "restored" && state.restored
      ? `<div class="restored"><span>Earlier check · ${esc(timeAgo(state.restored.checkedAt))}</span><button id="back-live" type="button">Back to this page</button></div>`
      : ""}
    <section class="verdict ${verdictClass}" aria-label="Overall verdict">
      <div class="verdict__site">${esc(domain)}</div>
      <div class="verdict__badge"><span class="verdict__icon">${verdictIcon}</span>${verdictLabel}</div>
      <p class="verdict__sentence">${verdictSentence}</p>
    </section>
    <section class="metrics" aria-label="Core Web Vitals metrics">
      ${readings.map((r) => renderMetric(r)).join("")}
    </section>
    ${renderSource()}
    <div class="actions">
      <button class="btn-secondary" id="copy-card" type="button" ${!settled || state.exportState === "rendering" ? "disabled" : ""}>
        ${state.exportState === "rendering" ? "Rendering…" : state.exportState === "error" ? "Copy failed — try again" : "Copy result card"}
      </button>
    </div>
    ${renderRecent()}`;

  bind();
}

function renderHeader(): string {
  return `
    <header class="header">
      <span class="header__brand">Core Web Vitals Snapshot</span>
      <button class="header__options" id="open-options" type="button" aria-label="Extension options" title="Options">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6 11 5M5 11l-1.4 1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
    </header>`;
}

function renderMetric(r: MetricReading): string {
  const open = state.expanded.has(r.metric);
  const eff = effectiveStatus(r);
  const showFix = eff === "needs-improvement" || eff === "poor";
  const note = disagreementNote(r);
  const explainer = EXPLAINERS[r.metric];
  const cruxUnavailable = r.cruxStatus === "no-data";
  const cruxHint =
    state.crux?.status === "error"
      ? "Could not reach Google's dataset — showing this visit only."
      : cruxUnavailable && state.crux
        ? "Not enough real visitor data for this site yet. That's common for smaller sites — nothing to worry about."
        : (state.crux?.collectionPeriod ? `Real visitors, ${state.crux.collectionPeriod}` : "");

  return `
    <div class="metric ${open ? "metric--open" : ""}">
      <button class="metric__summary" type="button" data-metric="${r.metric}" aria-expanded="${open}" id="metric-btn-${r.metric}">
        <span class="chip chip--${r.liveStatus === "pending" && eff === "pending" ? "pending" : eff}">${statusIcon(eff)}${STATUS_WORD[eff]}</span>
        <span class="metric__text">
          <span class="metric__name">${humanName(r.metric)} <abbr title="${r.metric}">· ${r.metric}</abbr></span>
          <span class="metric__sentence">${esc(r.sentence)}</span>
        </span>
        <span class="metric__chevron">${ICON_CHEVRON}</span>
      </button>
      ${open
        ? `<div class="metric__detail">
            <div class="compare">
              <div class="compare__cell">
                <div class="compare__label">This visit</div>
                <div class="compare__value compare__value--${r.liveStatus === "pending" ? "none" : r.liveStatus}">${r.liveValue === null ? (r.metric === "INP" ? "no interaction yet" : "measuring…") : formatValue(r.metric, r.liveValue)}</div>
                <div class="compare__hint">Measured in your browser just now</div>
              </div>
              <div class="compare__cell">
                <div class="compare__label">What Google sees</div>
                <div class="compare__value compare__value--${cruxUnavailable ? "none" : (r.cruxStatus as string)}">${r.cruxP75 === null ? "no data yet" : formatValue(r.metric, r.cruxP75)}</div>
                <div class="compare__hint">${esc(cruxHint)}</div>
              </div>
            </div>
            ${note ? `<p class="metric__note">${esc(note)}</p>` : ""}
            <p class="metric__explainer"><strong>What does this mean?</strong> ${esc(explainer.what)} ${esc(explainer.why)}</p>
            ${showFix
              ? `<a class="fix-cta" href="${WHAT_IT_MEANS_URL}?${UTM_SUFFIX}#${r.metric.toLowerCase()}" target="_blank" rel="noopener">Get this fixed
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 6h7M6.5 3l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </a>`
              : ""}
          </div>`
        : ""}
    </div>`;
}

function renderSource(): string {
  const cruxOk = state.crux?.status === "ok";
  const label = !state.crux
    ? "Checking Google's Chrome UX Report…"
    : state.crux.status === "ok"
      ? `Measured with Google's official thresholds · field data ${state.crux.collectionPeriod ?? ""}`
      : state.crux.status === "no-data"
        ? "Measured with Google's official thresholds · this visit only"
        : "Could not reach Google's dataset — showing this visit only";
  return `
    <button class="source" id="source-bar" type="button" aria-expanded="${state.sourceOpen}">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.2v4M8 4.8v.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <span>${esc(label)}</span>
    </button>
    ${state.sourceOpen
      ? `<div class="source__explain">
          <strong>Two kinds of measurement.</strong> “This visit” is your browser loading the page right now (lab data).
          “What Google sees” is the Chrome UX Report: the real experience of your visitors over the last 28 days${cruxOk ? "" : ", when enough visitor data exists"} (field data).
          Google's rankings use the field data.
        </div>`
      : ""}`;
}

function renderRecent(): string {
  const items = state.history;
  if (!items.length) return `<section class="recent" hidden></section>`;
  return `
    <section class="recent" aria-label="Recent checks">
      <h2 class="recent__title">Recent checks</h2>
      <ul class="recent__list">
        ${items
          .map(
            (h, i) => `
          <li>
            <button class="recent__item" type="button" data-recent="${i}">
              <span class="mini-badge mini-badge--${h.overall}" aria-hidden="true"></span>
              <span class="recent__domain">${esc(domainOf(h.origin))}</span>
              <span class="visually-hidden">${VERDICT_LABEL[h.overall]}</span>
              <span class="recent__time">${esc(timeAgo(h.checkedAt))}</span>
            </button>
          </li>`,
          )
          .join("")}
      </ul>
    </section>`;
}

/* ---------------- events ---------------- */

function bind(): void {
  document.getElementById("open-options")?.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  });

  app.querySelectorAll<HTMLButtonElement>("[data-metric]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = btn.dataset.metric as MetricName;
      state.expanded.has(m) ? state.expanded.delete(m) : state.expanded.add(m);
      render();
      document.getElementById(`metric-btn-${m}`)?.focus();
    });
  });

  document.getElementById("source-bar")?.addEventListener("click", () => {
    state.sourceOpen = !state.sourceOpen;
    render();
    document.getElementById("source-bar")?.focus();
  });

  document.getElementById("back-live")?.addEventListener("click", () => {
    state.mode = "live";
    state.restored = null;
    render();
  });

  document.getElementById("copy-card")?.addEventListener("click", async () => {
    const snapshot = currentSnapshot();
    if (!snapshot) return;
    state.exportState = "rendering";
    render();
    try {
      await copyResultCard(snapshot);
      state.exportState = "copied";
      showToast("Result card copied — paste it anywhere");
    } catch {
      state.exportState = "error";
      showToast("Could not copy the card");
    }
    render();
  });

  app.querySelectorAll<HTMLButtonElement>("[data-recent]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const snap = state.history[Number(btn.dataset.recent)];
      if (!snap || !snap.metrics.length) return;
      state.mode = "restored";
      state.restored = snap;
      state.expanded.clear();
      render();
    });
  });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(message: string): void {
  toastEl.textContent = message;
  toastEl.classList.add("toast--visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("toast--visible"), 2600);
}

/* ---------------- measurement lifecycle ---------------- */

let saveQueued = false;

function settle(): void {
  if (state.settled || state.mode !== "live" || !state.origin) return;
  state.settled = true;
  const snapshot = currentSnapshot()!;
  liveRegion.textContent = `Verdict for ${domainOf(state.origin)}: ${VERDICT_LABEL[snapshot.overall]}. ${VERDICT_SENTENCE[snapshot.overall]}`;
  persist();
  render();
}

function persist(): void {
  if (saveQueued || state.mode !== "live") return;
  const snapshot = currentSnapshot();
  if (!snapshot) return;
  saveQueued = true;
  chrome.runtime
    .sendMessage({ type: "save-snapshot", snapshot, tabId: state.tabId })
    .then(() => chrome.runtime.sendMessage({ type: "get-history" }))
    .then((history: VerdictSnapshot[]) => {
      state.history = history ?? [];
      saveQueued = false;
      render();
    })
    .catch(() => {
      saveQueued = false;
    });
}

async function init(): Promise<void> {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "cwv-live-metric" && state.mode !== "restored") {
      state.live[message.metric as MetricName] = message.value as number;
      if (state.settled) persist();
      render();
    }
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? "";
  if (!tab?.id || !/^https?:\/\//.test(url)) {
    state.mode = "unsupported";
    const history = (await chrome.runtime.sendMessage({ type: "get-history" })) as VerdictSnapshot[];
    state.history = history ?? [];
    render();
    return;
  }

  state.tabId = tab.id;
  state.origin = new URL(url).origin;
  render();

  const historyPromise = chrome.runtime.sendMessage({ type: "get-history" });
  chrome.runtime.sendMessage({ type: "inject-measure", tabId: tab.id });
  const cruxPromise = chrome.runtime.sendMessage({
    type: "fetch-crux",
    origin: state.origin,
  });

  state.history = ((await historyPromise) as VerdictSnapshot[]) ?? [];
  render();

  state.crux = ((await cruxPromise) as CruxResult) ?? {
    status: "error",
    p75: {},
    collectionPeriod: null,
  };
  render();

  // Settle once CrUX is back and live metrics had a moment to arrive —
  // the verdict must appear in well under two seconds.
  setTimeout(settle, state.live.LCP !== undefined ? 150 : 900);
}

init();
