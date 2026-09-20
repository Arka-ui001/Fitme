# ForgeAI — Fitness Intelligence

A personal, AI-powered fitness intelligence dashboard. Dark, premium, practical.
Built as a dependency-free frontend (vanilla HTML/CSS/JS) so engineering effort can
stay focused on the AI / computer-vision backend — not on a build pipeline.

## Run it

No build step. Two options:

**Option 1 — just open it**

    unzip → double-click index.html

Everything (routing, charts, simulated AI) works from the local filesystem.

**Option 2 — serve it (recommended during development)**

    cd forgeai
    python3 -m http.server 8080
    # → http://localhost:8080

or `npx serve .`

## Structure

    forgeai/
    ├── index.html                  App shell (sidebar, topbar, mounts)
    └── assets/
        ├── css/main.css            Design system + all component styles
        └── js/
            ├── icons.js            Inline SVG icon set
            ├── data.js             ⚠ PLACEHOLDER DATA (shaped like planned API responses)
            ├── api.js              Forge.api — async data layer (swap for real fetch() here)
            ├── charts.js           Dependency-free SVG charts (line, bars, rings, sparklines…)
            ├── components.js       Reusable UI components (MetricCard, AIInsightCard, …)
            ├── app.js              Router, sidebar/topbar, bottom nav, toasts
            └── pages/              One file per route
                dashboard.js  progress.js  workouts.js  nutrition.js
                analysis.js   coach.js     history.js   evaluation.js  settings.js

## Swapping placeholder data for the real backend

All pages read data through `Forge.api` (`assets/js/api.js`). That layer now
implements the real backend adapter: it fetches the FastAPI endpoints when a
backend is reachable (auto-connect — see below) and maps the responses into the
exact shapes the pages expect, falling back to `assets/js/data.js` otherwise.
No page code touches `fetch()` directly.

Simulated AI surfaces (marked in code) that should become real API calls:

- **AI Coach** replies — `assets/js/pages/coach.js` → `forgeRespond()`
- **Photo/video analysis pipeline** — `assets/js/pages/analysis.js` → `runPipeline()`
- **Evaluation feedback** — `assets/js/pages/evaluation.js` → POST on ✓ / ⚠ / ✕

## Design system (tokens in `main.css`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#08090b` | App background |
| `--panel` | `#121419` | Cards |
| `--border` | `#1e232b` | Hairlines |
| `--accent` | `#c8fa4b` | Electric lime — progress, active, AI insights |
| `--cyan / --blue / --purple` | — | Secondary, used sparingly |
| `--warn / --danger` | orange / red | Only for warnings |

Typography: Inter (loaded when online) with a clean system fallback. Numbers use
tabular figures. Layout: persistent sidebar (icon rail ≤1100px, bottom nav ≤760px).

## Connecting the ForgeAI backend

The data layer (`assets/js/api.js`) **auto-connects** to the FastAPI backend
(`../backend`) when one is reachable — no configuration needed:

1. It probes, in order: the base you explicitly `connect()`ed, `window.FORGE_API_BASE`,
   this origin's port-9901 twin (`https://8080-abc.e2b.app` → `https://9901-abc.e2b.app`),
   and `localhost:9901` when served from localhost.
2. It authenticates with the stored JWT, or signs in to the public demo account
   (`demo@forgeai.dev`), or — on any failure — falls back to bundled demo data.
3. `/api/dashboard`, `/api/progress`, `/api/workouts`, `/api/nutrition` and
   `/api/auth/me` are mapped into the UI's shapes; coach / analysis / evaluation
   pages stay on demo data until a real AI provider is attached to the backend.

Console overrides:

```js
Forge.api.connect("http://localhost:8000", "<JWT>"); // pin a backend (+ your account)
Forge.api.disconnect();                              // pin demo mode until next connect()
```

If the backend is down, every page still renders from demo data — the app never
shows an error screen for a missing backend. See `backend/README.md` for setup.

## Notes

- Progress "photos" are abstract CV-style silhouette placeholders with pose-estimation
  overlays — swap in real image URLs from the backend when available
  (`data.js → bodyProgress.sessions[].photos`).
- All AI conclusions, confidence scores and evidence lists are **placeholder content**,
  structured to match the formats the backend is expected to return.
