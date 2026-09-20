# ForgeAI — Backend

Production-quality FastAPI backend for the **ForgeAI** personal fitness intelligence
dashboard. PostgreSQL + SQLAlchemy + Alembic, JWT auth, deterministic fitness/nutrition
calculation engines, validated file uploads, and an **AI-provider-independent** layer
(the default stub provider needs **no API key**, so the entire backend works offline).

---

## 1. Quickstart

### Option A — Docker (PostgreSQL included, recommended)

```bash
cd backend
cp .env.example .env            # optional: adjust SECRET_KEY etc.
docker compose up --build
```

That's it:

| URL | What |
|---|---|
| http://localhost:8000/docs | Interactive OpenAPI docs (authorize with a bearer token) |
| http://localhost:8000/health | Liveness + DB check |
| `demo@forgeai.dev` / `forgeai-demo` | Seeded demo account (`is_demo=True`, clearly separated) |

### Option B — Manual (local Python)

Requires Python 3.11+ and a running PostgreSQL (or use SQLite for a zero-setup dev DB).

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env            # then edit DATABASE_URL / SECRET_KEY

# 1) create schema (PostgreSQL or sqlite:///./forgeai.db)
alembic upgrade head

# 2) seed the demo user + 16 weeks of realistic data
python -m app.db.seed           # add --reset to rebuild, --if-missing to skip if present

# 3) run
uvicorn app.main:app --reload --port 8000
```

> **SQLite shortcut:** set `DATABASE_URL=sqlite:///./forgeai.db` in `.env` to try
> everything without PostgreSQL. SQLite is for development only — use PostgreSQL in prod.

### Tests

```bash
pip install -r requirements-dev.txt
pytest tests/ -q                # 55 tests: auth, calc engines, endpoints, uploads, DB
```

---

## 2. Environment (`.env`)

Copy `.env.example` → `.env`. Key variables:

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | change-me | JWT signing — **must** be a long random value in prod |
| `DATABASE_URL` | postgres (compose) / sqlite | SQLAlchemy URL (`postgresql+psycopg2://…`) |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins; tighten for prod |
| `STORAGE_BACKEND` | `local` | `local` now, `s3` ready as a stub |
| `UPLOAD_DIR` | `uploads` | Local storage root |
| `MAX_PHOTO_MB` / `MAX_VIDEO_MB` | 15 / 200 | Upload size caps |
| `AI_PROVIDER` | `stub` | Provider key resolved in `app/services/ai/provider.py` |
| `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` | demo@forgeai.dev | Seed credentials |

Generate a strong secret:
`python -c "import secrets; print(secrets.token_urlsafe(48))"`

---

## 3. API surface

All responses use a consistent envelope:

```json
{ "success": true,  "data": { ... }, "error": null }
{ "success": false, "data": null, "error": { "code": "…", "message": "…" } }
```

Auth = `Authorization: Bearer <token>` (JWT, `POST /api/auth/login` to obtain).

| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/auth/register` | email + password (bcrypt) + name |
| POST | `/api/auth/login` | → `access_token` |
| GET | `/api/auth/me` | profile included |
| GET | `/api/dashboard` | everything the frontend dashboard needs, computed from DB |
| GET | `/api/progress` | weight series, measurements, photo sessions, AI observations |
| POST | `/api/progress/weight` | append-only weight log |
| POST | `/api/progress/measurements` | **append-only history — never overwritten** |
| POST | `/api/progress/photos` | multipart upload (no analysis) |
| GET | `/api/progress/photos` | list with storage keys |
| GET | `/api/workouts` | sessions + week grid + PRs + volume stats |
| POST | `/api/workouts` | create session (optionally with sets) |
| POST | `/api/workouts/{id}/sets` | append sets (progressive overload tracking) |
| GET | `/api/nutrition` | today + meals + weekly averages (deterministic) |
| POST | `/api/nutrition/food` | add to global food catalog |
| POST | `/api/nutrition/meals` | create/merge meal + log foods; recomputes daily totals |
| POST | `/api/analysis/photo` | upload → validate → store → analyze (provider) |
| POST | `/api/analysis/video` | same for exercise video |
| GET | `/api/analysis/{id}?kind=photo\|video` | structured analysis result |
| POST | `/api/coach/chat` | grounded reply (memories + bounded history) |
| GET | `/api/coach/conversations` | list with previews |
| GET | `/api/coach/conversations/{id}` | full thread + rolling summary |
| POST | `/api/evaluations/{report_id}/feedback` | `correct` / `partially_correct` / `incorrect` |
| GET | `/api/evaluations` | reports + your feedback (improvement loop view) |
| GET | `/api/files/{key}` | serves uploads **by storage key only** (path-safe) |
| GET | `/health` | liveness + DB |

Rate limiting (in-memory sliding window, Redis-swappable) protects auth, chat and
uploads. CORS, input validation and upload signature checks are always on.

---

## 4. Architecture

```
backend/
├── app/
│   ├── main.py                 # app factory, CORS, envelope errors, /docs
│   ├── api/
│   │   ├── deps.py             # get_db, get_current_user (JWT), pagination
│   │   └── routes/             # THIN handlers — logic lives in services
│   ├── models/                 # SQLAlchemy 2.0 models (21 tables)
│   ├── schemas/                # Pydantic request/response models + envelope
│   ├── services/
│   │   ├── nutrition_service.py  # DETERMINISTIC totals/averages (never an LLM)
│   │   ├── fitness_service.py    # weight trends, volume, PRs (Epley e1RM), trends
│   │   ├── dashboard_service.py  # aggregation + rule-based insight (→ AIReport)
│   │   ├── coach_service.py      # memories + bounded context → provider reply
│   │   ├── analysis_service.py   # upload → store → provider → structured JSON
│   │   ├── memory_service.py     # persistent AI memory (8 categories)
│   │   ├── upload_service.py     # ext + MIME + magic-byte + size validation
│   │   ├── storage.py            # StorageBackend: LocalStorage (S3 stub ready)
│   │   ├── rate_limit.py         # sliding-window limiter (Redis-swappable)
│   │   └── ai/                   # ← the AI seam (spec §21)
│   │       ├── base.py           # AIProvider interface + structured result models
│   │       ├── provider.py       # registry/factory — the ONLY place that knows
│   │       ├── prompts.py        # templates for future LLM providers
│   │       └── stub_provider.py  # deterministic, no API key, honest limitations
│   ├── repositories/           # data access (no business logic)
│   ├── core/                   # config (pydantic-settings), security, errors, logging
│   ├── db/                     # engine/session, model registry, demo seed
│   └── utils/
├── migrations/                 # Alembic (single initial migration, PG-compatible)
├── tests/                      # pytest — 55 tests, isolated per-test SQLite
├── uploads/                    # runtime files (git-ignored)
├── scripts/walkthrough.sh      # end-to-end curl walkthrough of every endpoint
├── Dockerfile / docker-compose.yml
└── requirements(-dev).txt
```

### The AI seam (build this next, without touching routes)

Routes and services call **only** these interfaces (`app/services/ai/base.py`):

```python
provider.analyze_photo(PhotoAnalysisInput)  -> AnalysisResult   # structured JSON
provider.analyze_video(VideoAnalysisInput)  -> AnalysisResult
provider.generate_coach_reply(message, history, context) -> CoachReply
provider.summarize_conversation(messages)   -> str
```

To add a real provider:

1. Implement `AIProvider` in `app/services/ai/openai_provider.py` (etc.).
2. Register it in `PROVIDERS` inside `app/services/ai/provider.py`.
3. Set `AI_PROVIDER=<name>` + the provider's API key in `.env`.

No route, service, or frontend change is required. Grounding facts come from the
deterministic engines via `UserContext` — **providers receive numbers, they never
compute them**. The stub provider demonstrates the honesty contract: it labels
itself in `model_name`, cites its evidence, and states plainly when computer
vision isn't wired in rather than fabricating pose data.

### Design guarantees

- **Measurements are append-only** — new rows per snapshot, history never mutated.
- **Nutrition math is deterministic** (`nutrition_service.py`) — an LLM is never
  asked to do arithmetic; `DailyNutrition` rows are a recomputed cache.
- **PRs / progressive overload** use Epley e1RM per exercise, tracked over time.
- **Muscle trends are qualitative** (`improving | stable | declining`) with a
  *data-coverage* confidence — the API never invents "+17.83%" style precision.
- **Uploads never trust client filenames** — uuid storage keys, extension+MIME+
  magic-byte checks, size caps; responses expose keys only, never paths.
- **Errors are consistent** (`success/data/error` envelope) and never leak internals.
- **Demo data is isolated** — the seeded account carries `is_demo=True`; registered
  users start empty.

---

## 5. Connecting the existing frontend

The frontend (`forgeai/`) connects to this backend **automatically**: its data
layer probes for a reachable backend (explicitly configured base, the origin's
port-9901 twin on preview hosts, or `localhost:9901`) and signs in with the
public demo account (`demo@forgeai.dev` / `forgeai-demo`) when no JWT is stored.
If nothing answers, it transparently serves its bundled demo data.

Manual override from the browser console:

```js
Forge.api.connect("http://localhost:8000", "<JWT from POST /api/auth/login>");
// effective immediately; persists across reloads
Forge.api.disconnect();   // pin demo mode until the next connect()
```

(or set `window.FORGE_API_BASE` before scripts load to pin a base without
localStorage). The adapter maps `/api/dashboard`, `/api/progress`, `/api/workouts`,
`/api/nutrition` and `/api/auth/me` into the frontend's display shapes; AI-backed
surfaces stay on demo content until a real provider is registered.

For CORS, set `CORS_ORIGINS` to your frontend origin(s) (comma-separated). The
default `*` covers local development and preview hosts.

---

## 6. Useful commands

```bash
alembic upgrade head                     # apply migrations
alembic revision --autogenerate -m "…"  # new migration after model changes
python -m app.db.seed --reset            # rebuild demo data
python -m app.db.seed --if-missing       # seed only if demo user absent
bash scripts/walkthrough.sh              # e2e check against a running server
pytest tests/ -q                         # test suite
```

## 7. Roadmap (deliberately out of scope for this foundation)

1. Real AI provider(s) behind the existing seam (photo CV, video pose, coach LLM).
2. `S3Storage` implementation (interface + factory already wired).
3. Redis-backed rate limiting (drop-in replacement for the in-memory limiter).
4. Refresh tokens / OAuth, background job queue for long analyses.
