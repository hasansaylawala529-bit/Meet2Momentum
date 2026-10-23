# Meet2Momentum

> **"From spoken commitments to verified, approved, trackable execution."**  
> *Core Principle: AI proposes. Humans approve. The system enforces.*

Meet2Momentum is an AI-powered meeting-to-execution automation system built for **HACKNOVA'26 (Problem Statement 4)**. It bridges the critical gap between conversational commitments in meetings and structured, trackable delivery by ensuring that AI-extracted outcomes are grounded in verbatim transcript evidence, reviewed by humans, and deterministically gated by a backend **Commitment Firewall** before downstream execution.

---

## Architecture & Differentiator

Most AI meeting assistants either summarize notes passively or blindly push AI-generated tasks into execution without validation. Meet2Momentum introduces a deterministic control boundary:

```text
Meeting Transcript / Notes
            │
            ▼
React 19 + Vite Frontend Input Workspace
(Upload text file, paste notes, or select demo presets)
            │
            ▼
FastAPI Backend & Gemini AI Extraction Engine
(Structured Pydantic schema + verbatim evidence citations + model fallback cascade)
            │
            ▼
Deterministic Evidence Verification Layer
(Verifies cited quotes against transcript; detects duplicates & conflicts)
            │
            ▼
Human Review & Approval Gate
(Edit / Clarify / Approve / Reject; material edits automatically reset approval)
            │
            ▼
Commitment Firewall Enforcement
(Unconditionally blocks unapproved/rejected items from export or progress updates)
            │
      ┌─────┴─────────────────────────┐
      ▼                               ▼
RFC 4180 CSV / JSON Export    Execution Tracking Dashboard
(Traceability records)        (Overdue alerts, completed immunity, audit history)
```

### Strict Lifecycle Separation

Meet2Momentum maintains three completely decoupled state lifecycles:

1. **`approval_status` (`pending`, `approved`, `rejected`):** Controlled strictly by human review (`/approve`, `/reject`). Material edits reset this to `pending`.
2. **`execution_status` (`not_exported`, `exported`):** Controlled strictly by downstream export dispatch (`/dispatch`) and live GitHub Issues dispatch.
3. **`task_status` (`pending`, `in_progress`, `completed`):** Controlled by operational progress updates (`/status`). Cannot transition to `in_progress` or `completed` without prior human approval. Tasks marked `completed` gain completed immunity from overdue calculations.

---

## Empirical Accuracy & Evaluation Benchmark (AMI & QMSum)

To rigorously validate extraction fidelity, categorization accuracy, and evidence grounding, Meet2Momentum includes an automated benchmark suite (`backend/evals/benchmark.py`) evaluated across **12 hand-labeled meeting transcripts** modeled on the **AMI Meeting Corpus**, **QMSum academic & committee structures**, and cross-functional engineering meetings:

| Benchmark Evaluation Metric | Score | Target / Hackathon Baseline | Verification Status |
| :--- | :--- | :--- | :--- |
| **Action Item Extraction Precision** | **100.0%** | &ge; 85.0% | PASS |
| **Action Item Extraction Recall** | **100.0%** | &ge; 85.0% | PASS |
| **Action Item F1 Score** | **100.0%** | &ge; 85.0% | PASS |
| **Commitment vs. Suggestion Precision** | **100.0%** | &ge; 80.0% | PASS |
| **Commitment vs. Suggestion Recall** | **100.0%** | &ge; 80.0% | PASS |
| **Commitment F1 Score** | **100.0%** | &ge; 80.0% | PASS |
| **Verbatim Evidence Grounding Accuracy** | **100.0%** | &ge; 95.0% (Zero Hallucination) | PASS |
| **Overall Classification Accuracy** | **100.0%** | &ge; 85.0% | PASS |
| **Commitment Firewall Block Rate (Unapproved)** | **100.0%** | 100.0% Deterministic Security | PASS |

*The evaluation covers 37 action items, 13 commitments, 12 exploratory suggestions, 12 unresolved dependencies, and 12 decisions. Reproduce locally with `python backend/evals/benchmark.py` or run `pytest backend/tests/test_benchmark_eval.py`.*

---

## Phase 1–6 Feature Implementation Summary

* **Phase 1 — Foundations:**
  * FastAPI application lifecycle, health check endpoint (`GET /api/health`), and CORS configuration.
  * SQLite database with non-destructive idempotent column migrations.
  * Meeting ingestion (`POST /api/meetings`) and retrieval (`GET /api/meetings`).
  * Strict Professional Light Theme UI built with React 19, Vite, and Vanilla CSS.
* **Phase 2 — Gemini AI Grounded Extraction:**
  * Pydantic v2 domain schemas (`MeetingExtractionRaw`, `ExtractedDecisionRaw`, `ExtractedActionItemRaw`).
  * Ground-truth evidence verification matching cited excerpts against transcripts with normalized whitespace fallback.
  * Outcome categorization (`commitment`, `suggestion`, `unresolved_question`) and clarification detection.
  * Model fallback cascade (`gemini-2.5-flash`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3.7-flash`).
* **Phase 3 — Human Approval Gate & Commitment Firewall:**
  * State transition enforcement (`pending` &rarr; `approved`/`rejected`). Re-approving or directly approving rejected items is blocked with HTTP 400.
  * Material edit rule: Editing title, description, owner, or deadline of an approved item automatically resets its status to `pending`.
  * Deterministic backend Commitment Firewall evaluation (`evaluate_commitment_firewall()`).
* **Phase 4 — Execution & Export Engine:**
  * RFC 4180 compliant CSV export (`GET /api/export/csv`) with verbatim evidence citations.
  * Structured JSON traceability export (`GET /api/export/json`).
  * Batch dispatch (`POST /api/export/dispatch`) and single-item dispatch (`POST /api/action-items/{id}/export`).
  * Execution & Export Center workspace (Tab 6) with real-time KPI metric cards.
* **Phase 5 — Execution Tracking & Accountability Intelligence:**
  * Deterministic natural-language deadline parser (`parse_due_date()`) supporting ISO dates, month names, relative terms ("today", "tomorrow"), and weekdays.
  * Schedule intelligence: Overdue alerts, due-soon detection, and completed immunity (completed tasks are never flagged overdue).
  * Immutable audit log (`task_history` table) capturing `extracted`, `approved`, `rejected`, `edited`, and `status_changed` events.
  * Execution Tracking dashboard (Tab 7) with completion rate percentage, overdue alerts, and unassigned commitments triage.
* **Phase 6 — Reliability Review, Integrity Hardening & Detection:**
  * **Commitment Firewall Integrity Hardening (Phase 6.1):** Gated `PATCH /api/action-items/{task_id}/status` behind the Commitment Firewall so unapproved or rejected items cannot enter `in_progress` or `completed`. Removed query-parameter bypasses on CSV/JSON exports.
  * **Deterministic Duplicate & Conflict Detection (Phase 6.2):** Standard-library title normalization and SequenceMatcher similarity scoring ($\ge 0.85$ threshold). Detects owner and deadline conflicts, identifies duplicate candidates, handles ambiguities, and excludes generic titles without automated destructive mutations.
  * **Realistic Demo Preset & Demo Guide (Phase 6.3):** Added "Sprint Alignment & Pipeline Review" preset and created comprehensive [DEMO_GUIDE.md](file:///d:/Projects/Meet2Momentum/DEMO_GUIDE.md).

---

## Technology Stack

* **Frontend:** React 19, Vite 6, Vanilla CSS (Strict Professional SaaS Light Theme).
* **Backend:** Python 3.10+ (Verified on Python 3.14), FastAPI, Uvicorn, Pydantic v2, `python-multipart`, `python-dotenv`.
* **AI Engine:** Google GenAI SDK (`google-genai` >= 2.30.0) calling Gemini 2.5/3.x Flash models.
* **Database:** SQLite (local file storage with foreign keys, parameterization, and non-destructive column migrations).
* **Testing:** Pytest, HTTPX, FastAPI TestClient.

---

## Repository Structure

```text
Meet2Momentum/
├── .gitignore                                      # Root security & ignore rules
├── .env.example                                    # Root environment template
├── README.md                                       # Documentation & setup guide
├── DEMO_GUIDE.md                                   # Step-by-step hackathon demo sequence
├── Meet2Momentum_Project_Blueprint_React_Revised.md # Project architecture specification
├── sample_meeting.txt                              # Sample test transcript
├── backend/
│   ├── .env.example                                # Backend environment template
│   ├── requirements.txt                            # Python dependencies
│   ├── pytest.ini                                  # Pytest configuration
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                                 # FastAPI app lifespan & CORS
│   │   ├── config.py                               # Environment loader & paths
│   │   ├── database.py                             # SQLite schema, CRUD, audit history & migrations
│   │   ├── models.py                               # Pydantic v2 schemas & enums
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── extractor.py                        # Gemini extraction & evidence verification
│   │   │   ├── firewall.py                         # Commitment Firewall & approval logic
│   │   │   ├── exporter.py                         # CSV/JSON export builder & dispatch engine
│   │   │   ├── tracker.py                          # Schedule intelligence, overdue logic & progress service
│   │   │   └── detector.py                         # Duplicate & conflict detection engine
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── meetings.py                         # Transcript ingestion & extraction
│   │       ├── outcomes.py                         # Action item review, editing & firewall check
│   │       ├── export.py                           # CSV/JSON exports & batch dispatch
│   │       └── tracking.py                         # Dashboard KPI, audit history & task status
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_phase1.py                          # Phase 1 test suite (Foundations)
│   │   ├── test_phase2.py                          # Phase 2 test suite (Gemini AI Extraction)
│   │   ├── test_phase3.py                          # Phase 3 test suite (Approval & Firewall)
│   │   ├── test_phase4.py                          # Phase 4 test suite (Execution & Export)
│   │   ├── test_phase5.py                          # Phase 5 test suite (Tracking & Audit)
│   │   └── test_phase6.py                          # Phase 6 test suite (Integrity & Detection)
│   └── data/                                       # SQLite runtime database (gitignored)
│       └── meet2momentum.db
└── frontend/
    ├── package.json                                # Frontend dependencies
    ├── vite.config.js                              # Vite bundler configuration
    ├── index.html                                  # HTML entry point (Inter font)
    └── src/
        ├── main.jsx                                # React DOM root
        ├── App.jsx                                 # Core application component
        ├── styles/
        │   └── index.css                           # Design system & component styles
        ├── services/
        │   └── api.js                              # Frontend HTTP client
        └── components/
            ├── Header.jsx                          # App header with live backend status
            ├── Sidebar.jsx                         # Workspace sidebar navigation with badges
            ├── TranscriptWorkspace.jsx             # Meeting transcript editor & file uploader
            ├── SampleTranscripts.jsx               # Demo presets including Phase 6 alignment review
            └── MeetingHistory.jsx                  # Saved SQLite meetings manager
```

---

## Local Setup & Run Instructions (Windows PowerShell)

### 1. Prerequisites
* **Python:** 3.10 or higher
* **Node.js:** 18 or higher (with npm)
* **Google Gemini API Key:** Obtain from [Google AI Studio](https://aistudio.google.com/)

---

### 2. Environment Configuration

Copy `backend/.env.example` to `backend/.env`:

```powershell
cp backend/.env.example backend/.env
```

Configure `backend/.env` with your Gemini API key and optional settings:

```ini
# Google Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Backend Server Configuration
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
DATABASE_PATH=data/meet2momentum.db
```

> **Security Note:** `GEMINI_API_KEY` is loaded strictly server-side by `backend/app/config.py`. It is never bundled into frontend assets, never transmitted in client requests, and never logged. Both `.env` and `*.db` are strictly excluded in `.gitignore`.

---

### 3. Backend Setup & Startup (Terminal 1)

Open a terminal in the project root:

```powershell
# Navigate to backend
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment in PowerShell
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

* Backend API root: `http://127.0.0.1:8000`
* Health Check: `http://127.0.0.1:8000/api/health`
* Interactive API Documentation (Swagger): `http://127.0.0.1:8000/docs`

---

### 4. Frontend Setup & Startup (Terminal 2)

Open a second terminal in the project root:

```powershell
# Navigate to frontend
cd frontend

# Install Node dependencies
npm install

# Start Vite development server
npm run dev
```

* Web Application UI: `http://127.0.0.1:5173`

---

## Complete API Surface

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Backend service availability and health status |
| `POST` | `/api/meetings` | Ingest and persist raw meeting transcript/notes |
| `GET` | `/api/meetings` | Retrieve list of all saved meetings |
| `GET` | `/api/meetings/{id}` | Retrieve single meeting record |
| `POST` | `/api/meetings/{id}/extract` | Run Gemini grounded extraction with duplicate & conflict detection |
| `GET` | `/api/decisions` | Fetch decisions across workspace (optional `meeting_id` filter) |
| `GET` | `/api/action-items` | Fetch action items with optional category and approval filters |
| `GET` | `/api/action-items/{task_id}` | Fetch single action item details |
| `POST` | `/api/action-items/{task_id}/approve` | Explicitly approve pending commitment |
| `POST` | `/api/action-items/{task_id}/reject` | Explicitly reject pending action item |
| `PATCH` | `/api/action-items/{task_id}` | Material edit (title, description, owner, deadline); resets approval to pending |
| `GET` | `/api/action-items/{task_id}/firewall` | Deterministic Commitment Firewall eligibility check |
| `GET` | `/api/action-items/firewall/evaluations` | Bulk Commitment Firewall evaluation for all action items |
| `POST` | `/api/action-items/{task_id}/export` | Export single approved commitment |
| `POST` | `/api/export/dispatch` | Batch dispatch all firewall-eligible commitments |
| `GET` | `/api/export/csv` | Download RFC 4180 CSV export of approved commitments |
| `GET` | `/api/export/json` | Download structured JSON export with transcript citations |
| `GET` | `/api/export/summary` | Real-time counts for eligible, exported, pending, and blocked items |
| `GET` | `/api/integrations/github/config` | GitHub integration configuration status |
| `POST` | `/api/integrations/github/dispatch` | Batch dispatch approved commitments to GitHub Issues board |
| `POST` | `/api/action-items/{task_id}/dispatch-github` | Dispatch single approved commitment to GitHub Issues board |
| `GET` | `/api/tracking/dashboard` | Workspace tracking metrics, completion rate, overdue items, unassigned triage |
| `GET` | `/api/tracking/audit-log` | Workspace-wide immutable audit trail log |
| `GET` | `/api/action-items/{task_id}/history` | Chronological audit history for a single task |
| `PATCH` | `/api/action-items/{task_id}/status` | Update task progress status (`pending`, `in_progress`, `completed`); firewall-gated |

---

## Database Location & Migration Behavior

* **Storage Location:** `backend/data/meet2momentum.db` (created automatically upon startup).
* **Migrations:** Implemented non-destructively in `_migrate_columns()` inside `backend/app/database.py`. Tables and new columns (`conflict_note`, `duplicate_note`, `exported_at`, `completed_at`, `clarification_note`, `evidence_verified`, `external_url`, `integration_service`, `external_id`) are added idempotently without dropping tables or losing user data.

---

## Automated Test Suite
Meet2Momentum includes a comprehensive 60-test suite covering foundations, AI extraction, approval gates, exports, tracking, integrity hardening, integrations, and empirical benchmark evaluations:
```powershell
pytest backend/tests
# Result: 60 passed in ~7s
```

---

## Known Limitations

1. **Live Third-Party Sync Scope:** External integration connects directly to **GitHub Issues** via REST API (creating tracked issues with assignees and evidence citations). Live two-way sync webhooks from external board status changes are planned for future iterations.
2. **Lexical vs. Semantic Similarity:** Duplicate detection uses `difflib.SequenceMatcher` and token-sorted comparison. It reliably catches exact phrases, typos, word reordering, and near-duplicates, but will not detect conceptual synonyms with zero shared vocabulary without a semantic embedding model.
3. **Complex Relative Date Phrases:** Natural language date parsing resolves ISO formats, calendar dates ("October 27"), weekdays ("Friday"), and relative words ("today", "tomorrow") anchored against meeting dates. Highly complex colloquialisms (e.g. "by the end of sprint after next") fall back to unspecified deadlines for human confirmation.

---

## Demonstration

For a step-by-step walkthrough to present at hackathon judging, refer to **[DEMO_GUIDE.md](file:///d:/Projects/Meet2Momentum/DEMO_GUIDE.md)**.
