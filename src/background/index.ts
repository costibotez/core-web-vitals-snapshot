/**
 * Service worker: CrUX fetch + 24h per-origin cache, session history (last 5
 * checks), programmatic injection of the measurement script, badge updates.
 *
 * No analytics, no other network calls. The only request that ever leaves the
 * browser is the CrUX lookup for the origin the user is checking.
 */
import { CRUX_CACHE_TTL_MS, CRUX_ENDPOINT, MAX_RECENT_CHECKS, COLORS } from "../shared/constants";
import type { CruxResult, MetricName, Settings, VerdictSnapshot } from "../shared/types";

const CRUX_API_KEY = import.meta.env.VITE_CRUX_API_KEY as string | undefined;

const CRUX_METRIC_MAP: Record<string, MetricName> = {
  largest_contentful_paint: "LCP",
  cumulative_layout_shift: "CLS",
  interaction_to_next_paint: "INP",
};

interface CruxCacheEntry {
  fetchedAt: number;
  result: CruxResult;
}

async function fetchCrux(origin: string): Promise<CruxResult> {
  const cacheKey = `crux:${origin}`;
  const cached = (await chrome.storage.session.get(cacheKey))[cacheKey] as
    | CruxCacheEntry
    | undefined;
  if (cached && Date.now() - cached.fetchedAt < CRUX_CACHE_TTL_MS) {
    return cached.result;
  }

  if (!CRUX_API_KEY) {
    // Built without a key (local dev): behave like a small site with no data
    // rather than erroring, so the popup stays honest and functional.
    return { status: "no-data", p75: {}, collectionPeriod: null };
  }

  let result: CruxResult;
  try {
    const res = await fetch(`${CRUX_ENDPOINT}?key=${CRUX_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin,
        formFactor: "DESKTOP",
        metrics: [
          "largest_contentful_paint",
          "cumulative_layout_shift",
          "interaction_to_next_paint",
        ],
      }),
    });

    if (res.status === 404) {
      // No CrUX data for this origin — common for small sites, not an error.
      result = { status: "no-data", p75: {}, collectionPeriod: null };
    } else if (!res.ok) {
      result = { status: "error", p75: {}, collectionPeriod: null };
    } else {
      const data = await res.json();
      const p75: Partial<Record<MetricName, number>> = {};
      const metrics = data.record?.metrics ?? {};
      for (const [key, name] of Object.entries(CRUX_METRIC_MAP)) {
        const raw = metrics[key]?.percentiles?.p75;
        if (raw !== undefined) p75[name] = Number(raw);
      }
      const cp = data.record?.collectionPeriod;
      const collectionPeriod = cp
        ? `${formatCruxDate(cp.firstDate)} – ${formatCruxDate(cp.lastDate)}`
        : null;
      result = { status: "ok", p75, collectionPeriod };
    }
  } catch {
    // Offline or blocked: the popup shows "could not reach Google's dataset".
    result = { status: "error", p75: {}, collectionPeriod: null };
  }

  // Cache everything except transient errors.
  if (result.status !== "error") {
    await chrome.storage.session.set({
      [cacheKey]: { fetchedAt: Date.now(), result } satisfies CruxCacheEntry,
    });
  }
  return result;
}

function formatCruxDate(d?: { year: number; month: number; day: number }): string {
  if (!d) return "";
  return `${d.day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.month - 1]} ${d.year}`;
}

async function getHistory(): Promise<VerdictSnapshot[]> {
  const { history = [] } = await chrome.storage.session.get("history");
  return history as VerdictSnapshot[];
}

async function saveSnapshot(snapshot: VerdictSnapshot): Promise<void> {
  const history = await getHistory();
  const rest = history.filter((h) => h.origin !== snapshot.origin);
  await chrome.storage.session.set({
    history: [snapshot, ...rest].slice(0, MAX_RECENT_CHECKS),
  });
}

async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get("settings");
  return { badgeEnabled: true, ...(settings ?? {}) };
}

const BADGE: Record<VerdictSnapshot["overall"], { text: string; color: string }> = {
  healthy: { text: "OK", color: COLORS.statusPass },
  "needs-attention": { text: "!", color: COLORS.statusWarn },
  "at-risk": { text: "!!", color: COLORS.statusFail },
};

async function updateBadge(tabId: number, overall: VerdictSnapshot["overall"]): Promise<void> {
  const { badgeEnabled } = await getSettings();
  if (!badgeEnabled) {
    await chrome.action.setBadgeText({ tabId, text: "" });
    return;
  }
  const badge = BADGE[overall];
  await chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
  await chrome.action.setBadgeText({ tabId, text: badge.text });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case "inject-measure": {
      chrome.scripting
        .executeScript({
          target: { tabId: message.tabId },
          files: ["content/measure.js"],
        })
        .then(() => sendResponse({ ok: true }))
        .catch((err: unknown) =>
          sendResponse({ ok: false, error: String(err) }),
        );
      return true;
    }
    case "fetch-crux": {
      fetchCrux(message.origin).then(sendResponse);
      return true;
    }
    case "save-snapshot": {
      const snapshot = message.snapshot as VerdictSnapshot;
      saveSnapshot(snapshot)
        .then(() =>
          typeof message.tabId === "number"
            ? updateBadge(message.tabId, snapshot.overall)
            : undefined,
        )
        .then(() => sendResponse({ ok: true }));
      return true;
    }
    case "get-history": {
      getHistory().then(sendResponse);
      return true;
    }
    case "clear-history": {
      chrome.storage.session.remove("history").then(() => sendResponse({ ok: true }));
      return true;
    }
    case "get-settings": {
      getSettings().then(sendResponse);
      return true;
    }
    case "set-settings": {
      chrome.storage.local
        .set({ settings: message.settings })
        .then(() => sendResponse({ ok: true }));
      return true;
    }
  }
  return false;
});
