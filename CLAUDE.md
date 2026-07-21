# Core Web Vitals Snapshot — Chrome extension

A one-click, plain-English Core Web Vitals verdict for the site you are on.
The companion landing page lives in the `nomad-developer.co.uk` repo at
`/tools/core-web-vitals-snapshot`.

## Design tokens (shared with the landing page Tailwind config)

- `--brand-primary: #ff7a18` — **action only, never status**. Hover: `#e56d10`.
  Small text on dark uses `#ff8c3a` (AA contrast on `#1a2332`).
- `--surface-dark: #1a2332` (popup bg, result card), raised: `#222d40`
- `--surface-light: #f4f5f7`
- Status (traffic light, reserved exclusively for verdicts):
  `--status-pass: #22c55e`, `--status-warn: #f59e0b`, `--status-fail: #ef4444`
- Type: **Sora 600** headings, **Inter 400/500** body (bundled woff2 in
  `src/assets/fonts/` — the extension never fetches remote fonts).
- Vibe: honest-diagnostic, calm-professional, instrument-not-advert.
  No dark patterns: no CTA on healthy verdicts, amber uses "worth attention"
  never alarm language, status is icon shape + color + text, never color alone.

## Stack

- Manifest V3, TypeScript, Vite + @crxjs/vite-plugin (popup/options/worker).
- Second vite pass (`vite.content.config.ts`) builds `src/content/measure.ts`
  as a classic IIFE → `dist/content/measure.js`, because it is injected with
  `chrome.scripting.executeScript` (no module support there).
- Official `web-vitals` library, **attribution build**, `reportAllChanges`.
  Buffered PerformanceObservers mean injecting at popup-open time still
  recovers the full LCP/CLS/INP history of the page visit.
- No UI framework in the popup — vanilla TS + CSS custom properties.
- Build: `npm run build` (typecheck + both vite passes → `dist/`).
  Load `dist/` unpacked at chrome://extensions.

## Manifest V3 permission rationale (do not widen)

- `activeTab` — measurement only runs on the tab the user clicked the icon on.
  Deliberately **no declared content script** → no "read all sites" warning.
- `scripting` — inject `content/measure.js` after the activeTab grant.
- `storage` — `chrome.storage.session`: history (last 5) + 24h CrUX cache;
  `chrome.storage.local`: badge preference.
- `host_permissions`: only `https://chromeuxreport.googleapis.com/*`.
- **No analytics anywhere in the extension.** The only network call is CrUX.

## CrUX API

- `POST https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=KEY`
- Body: `{ origin, formFactor: "DESKTOP", metrics: [largest_contentful_paint,
  cumulative_layout_shift, interaction_to_next_paint] }`
- 404 = no data for origin (common for small sites) → `cruxStatus: 'no-data'`,
  phrased without alarm in the UI.
- Key comes from `VITE_CRUX_API_KEY` (see `.env.example`), referrer-locked,
  baked in at build time. Responses cached per origin for 24h in
  `chrome.storage.session`.

## Official thresholds (single source: `src/shared/constants.ts`)

- LCP 2500/4000 ms · CLS 0.1/0.25 · INP 200/500 ms
- Verdict logic (`src/shared/verdict.ts`): any poor → at-risk; any
  needs-improvement → needs-attention; else healthy. **CrUX wins over the live
  reading when both exist** (CrUX is what Google actually uses); the expanded
  row explains disagreements in one sentence.

## Conventions

- All copy is plain English written for a non-technical owner; acronyms always
  ride with a human word (Loading · LCP). Sentences live in
  `src/shared/verdict.ts` and `src/shared/explainers.ts` — edit copy there.
- Popup is 360px, zero layout shift: every state reserves its space.
- `npm run dev` previews the popup in a browser via `chrome-dev-mock.ts`
  (auto-installed only when extension APIs are absent).
- Result card: 1200x630 PNG rendered on a canvas in the popup, clipboard via
  `ClipboardItem`. Footer must read "Checked with Core Web Vitals Snapshot by
  Nomad Developer, nomad-developer.co.uk".
