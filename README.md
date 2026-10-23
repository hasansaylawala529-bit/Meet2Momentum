# Meet2Momentum

> **"From spoken commitments to verified, approved, trackable execution."**  
> *Core Principle: AI proposes. Humans approve. The system enforces.*

Meet2Momentum is an AI-powered meeting-to-execution automation system built for **HACKNOVA'26 (Problem Statement 4)**. It bridges the gap between conversational commitments in meetings and structured, trackable project delivery.

---

## Phase 4 Scope & Status

This repository is at **Phase 4: Execution & Export Engine (Option A)**.

### Core Principle
> **"AI proposes. Humans approve. The system enforces."**

The Gemini AI extraction engine proposes decisions and action items from transcripts. The human reviewer evaluates, refines, and approves or rejects items. The deterministic backend Commitment Firewall enforces that **only verified, human-approved commitments can ever be dispatched for downstream execution or exported**.

---

### What Works in Phase 4:

#### 1. Deterministic Firewall Gating on Downstream Execution
- **Server-Side Enforcement**: The export engine (`backend/app/services/exporter.py`) verifies the Commitment Firewall on every candidate item. No client assertions are trusted.
- **Strict Block Rules**: Any commitment in `pending` review status or `rejected` status is deterministically blocked from export and downstream task creation.
- **Explicit Firewall Error Signals**: Attempting to export an unapproved item directly via `POST /api/action-items/{task_id}/export` raises a `FirewallValidationError` returning HTTP 400 with a descriptive reason (`approval_pending` or `item_rejected`).

#### 2. Full Decision-to-Execution Traceability Exports
- **RFC 4180 CSV Export (`GET /api/export/csv`)**:
  - Fully quoted and escaped tabular export suitable for Excel, Google Sheets, or project import.
  - Columns: `Task ID`, `Meeting ID`, `Meeting Title`, `Meeting Date`, `Category`, `Title`, `Description`, `Assigned Owner`, `Deadline`, `Approval Status`, `Evidence Grounded`, `Verbatim Evidence Excerpt`, `Execution Status`, `Exported At`.
- **Structured JSON Traceability Payload (`GET /api/export/json`)**:
  - Full schema-compliant JSON array containing parent meeting metadata, verbatim evidence citations, human approval state, and execution timestamps.
  - Optional `meeting_id` query parameter for scoped exports.

#### 3. Execution State Tracking & Dispatch Endpoints
- **Execution Lifecycle**: Items transition from `execution_status = "not_exported"` to `execution_status = "exported"`.
- **Exported Timestamp**: `exported_at` records the exact UTC ISO-8601 timestamp of downstream dispatch.
- **Batch Dispatch Endpoint (`POST /api/export/dispatch`)**:
  - Evaluates all eligible approved commitments (or a specific array of `task_ids`).
  - Dispatches eligible items and updates their database records atomically.
  - Returns `dispatched_count`, `exported_items`, and `blocked_items` (with exact firewall block reasons).
- **Single Item Dispatch (`POST /api/action-items/{task_id}/export`)**:
  - Dispatches an individual approved commitment.
- **Summary Metrics Endpoint (`GET /api/export/summary`)**:
  - Returns real-time counts for `total_commitments`, `approved_count`, `pending_export_count`, `exported_count`, and `blocked_firewall_count`.

#### 4. Frontend Execution & Export Center (Tab 6)
- **Dedicated Navigation**: Added `Execution & Export` workspace tab with dynamic badge count of ready-to-export commitments.
- **Summary Metrics Cards**: High-visibility cards displaying *Ready for Export* (Mint/Green), *Exported to Pipeline* (Pale Blue), *Blocked by Firewall* (Pale Red), and *Total Approved* (Lavender).
- **One-Click Actions Toolbar**: Direct downloads for audit-ready CSV, structured JSON, and batch "Dispatch All Ready" button with real-time feedback.
- **Interactive Traceability Table**: Clean data table showing each commitment's firewall status, meeting origin, assigned owner, deadline, transcript evidence quote, execution badge, and direct export trigger.
- **Card-Level Badges**: Action items in the workspace display execution badges (`⚡ Ready for Export`, `🚀 Exported`, `🔒 Blocked`) and direct "Export" action buttons for approved items.

---

### Previous Phase Deliverables (Preserved & Active):
- **Phase 1 Foundations**: Structured SQLite database, meeting capture, validation models, Colorful Professional Light Theme UI.
- **Phase 2 Gemini AI Extraction**: Ground-truth evidence verification, decision extraction, action item classification (`commitment`, `suggestion`, `unresolved_question`), hallucination protection.
- **Phase 3 Human Approval & Firewall**: Strict status transitions (`pending` &rarr; `approved`/`rejected`), material edit automatic re-approval reset, deterministic backend Commitment Firewall.


---

## Technology Stack

- **Frontend:** React 19, Vite 6, Vanilla CSS (Strict Professional Light Theme).
- **Backend:** Python 3.14+, FastAPI, Uvicorn, Pydantic v2, python-multipart, python-dotenv.
- **Database:** SQLite (local runtime storage with parameterized queries).
- **Testing:** Pytest, HTTPX, TestClient, Browser Subagent E2E testing.

---

## Project Structure

```text
Meet2Momentum/
├── .gitignore                                      # Root security & ignore rules
├── .env.example                                    # Environment variable template
├── README.md                                       # Documentation & setup guide
├── Meet2Momentum_Project_Blueprint_React_Revised.md # Project specification
├── sample_meeting.txt                              # Sample test transcript
├── backend/
│   ├── .venv/                                      # Local Python virtual environment (ignored)
│   ├── requirements.txt                            # Backend Python dependencies
│   ├── pytest.ini                                  # Pytest configuration
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                                 # FastAPI application & lifespan
│   │   ├── config.py                               # Environment loader & configuration
│   │   ├── database.py                             # SQLite initialization, CRUD & atomicity
│   │   ├── models.py                               # Pydantic v2 domain schemas & validation
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── extractor.py                        # Gemini extraction & ground-truth validation
│   │   │   ├── firewall.py                         # Commitment Firewall & approval logic
│   │   │   └── exporter.py                         # Traceability CSV/JSON builder & dispatch engine
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── meetings.py                         # Transcript ingestion, extraction & outcomes
│   │       ├── outcomes.py                         # Action item review, editing, firewall & decisions
│   │       └── export.py                           # CSV/JSON exports & batch execution dispatch
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_phase1.py                          # 10 automated test suites (Foundations)
│   │   ├── test_phase2.py                          # 8 automated test suites (Gemini AI Extraction)
│   │   ├── test_phase3.py                          # 12 automated test suites (Approval & Firewall)
│   │   └── test_phase4.py                          # 8 automated test suites (Execution & Export)
│   └── data/                                       # SQLite runtime data (ignored)
│       └── meet2momentum.db
└── frontend/
    ├── package.json                                # Frontend dependencies
    ├── vite.config.js                              # Vite bundler configuration
    ├── index.html                                  # HTML entry point with Inter font
    └── src/
        ├── main.jsx                                # React DOM root
        ├── App.jsx                                 # Core application component
        ├── styles/
        │   └── index.css                           # Strict light theme design system
        ├── services/
        │   └── api.js                              # HTTP client for backend endpoints
        └── components/
            ├── Header.jsx                          # App header with live status
            ├── Sidebar.jsx                         # Left sidebar navigation with counters
            ├── TranscriptWorkspace.jsx             # Transcript form & file upload
            ├── SampleTranscripts.jsx               # Demo presets
            └── MeetingHistory.jsx                  # Stored SQLite meetings panel
```

---

## Local Setup & Run Instructions

### 1. Prerequisites
- Python 3.10+ (Verified on Python 3.14.7)
- Node.js 18+ (Verified on Node.js v24.17.0, npm 11.13.0)
- Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/)

### 2. Environment Configuration
Create `backend/.env` (or root `.env`) from `.env.example`:
```powershell
cp .env.example backend/.env
```

Configure your environment variables in `backend/.env`:
```ini
# Google Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Database Configuration (Optional override)
# DATABASE_PATH=data/meet2momentum.db
```

> **Security Note:** Never place credentials in React frontend code, browser requests, or Git-tracked files. The backend reads `GEMINI_API_KEY` strictly from the server environment. If the API key is missing, meeting capture and manual review remain fully functional, and extraction requests return a safe configuration error rather than crashing.

---

### 3. Backend Setup & Run

Open a terminal in the project root:

```powershell
# Navigate to backend
cd backend

# Create virtual environment (if not already created)
python -m venv .venv

# Activate virtual environment
# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# On Linux/macOS:
# source .venv/bin/activate

# Install updated dependencies (including google-genai)
pip install -r requirements.txt

# Start the FastAPI server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The backend API endpoints:
- API Root: `http://127.0.0.1:8000`
- Health Endpoint: `GET /api/health`
- Meeting Extraction: `POST /api/meetings/{meeting_id}/extract`
- Decisions Endpoints: `GET /api/decisions`, `GET /api/meetings/{meeting_id}/decisions`
- Action Items Query: `GET /api/action-items?category=&approval_status=`, `GET /api/meetings/{meeting_id}/action-items`
- Single Action Item: `GET /api/action-items/{task_id}`
- Action Item Approval: `POST /api/action-items/{task_id}/approve`
- Action Item Rejection: `POST /api/action-items/{task_id}/reject`
- Action Item Material Edit: `PATCH /api/action-items/{task_id}`
- Single Item Firewall Check: `GET /api/action-items/{task_id}/firewall`
- Bulk Firewall Evaluations: `GET /api/action-items/firewall/evaluations`
- Single Item Export Dispatch: `POST /api/action-items/{task_id}/export`
- Batch Export Dispatch: `POST /api/export/dispatch`
- Audit-Ready CSV Export: `GET /api/export/csv?meeting_id=`
- Structured JSON Traceability Export: `GET /api/export/json?meeting_id=`
- Export Summary Metrics: `GET /api/export/summary`
- Interactive Swagger Docs: `http://127.0.0.1:8000/docs`

---

### 4. Frontend Setup & Run

Open a second terminal in the project root:

```powershell
# Navigate to frontend
cd frontend

# Install npm dependencies
npm install

# Start Vite dev server
npm run dev
```

The frontend application will be live at:
- Web Application: `http://127.0.0.1:5173`

---

### 5. Complete Workflow: Meeting to Execution Pipeline

1. **Capture Meeting:** In the **Meetings** workspace, paste meeting notes, choose a demo preset, or upload a `.txt` file, then click **Save Meeting Record**.
2. **AI Extraction:** On any saved meeting card, click **Process with AI** (or **Re-extract Outcomes**). The backend securely sends the saved transcript to Gemini AI with strict extraction schemas.
3. **Evidence Validation:** The backend automatically verifies that every quoted excerpt appears verbatim in the saved transcript without hallucinations.
4. **Review Decisions:** In the **Decisions** tab, view extracted decisions with exact transcript citations, supporting rationale, and "Grounded in Transcript" verification tags.
5. **Review Action Items:** In the **Action Items** tab, filter by **Confirmed Commitments** (Green), **Suggestions** (Peach), or **Unresolved Questions** (Amber). Unassigned owners or missing deadlines are highlighted with "Owner needed" and "Deadline needed" tags.
6. **Human Approval & Commitment Firewall:** Extracted action items initialize with `pending` approval status. Reviewers can approve, reject, or edit items directly in the Action Items workspace:
   - **Approve**: Transitions status to `approved`, granting `🛡️ Firewall: Eligible` status for execution.
   - **Reject**: Transitions status to `rejected`, setting `🛡️ Firewall: Blocked (Rejected)`.
   - **Material Edit**: If an already `approved` item's title, description, owner, or deadline is modified, the backend automatically resets its status to `pending`, requiring human re-approval.
   - **Firewall Gate**: The deterministic Commitment Firewall verifies database state server-side to guarantee that no unapproved, rejected, or incomplete item can proceed to downstream execution.
7. **Downstream Execution & Traceability Export (Phase 4):**
   - In the **Execution & Export** tab, view workspace metrics: *Ready for Export*, *Exported to Pipeline*, *Blocked by Firewall*, and *Total Approved*.
   - **Audit-Ready CSV**: Download complete tabular records with verbatim evidence quotes and meeting metadata.
   - **Structured JSON**: Export fully grounded traceability records.
   - **Batch Execution Dispatch**: Click **Dispatch All Ready** to transition eligible commitments to `exported` and record UTC `exported_at` timestamps. Unapproved items are protected and reported with deterministic block reasons.
   - **Single Item Dispatch**: Directly trigger execution for individual approved commitments from either the Action Items card or the Traceability Table.

---

### 6. Testing & Quality Assurance

All 38 automated backend test suites and the frontend production build have been executed and verified:

```powershell
# Run backend pytest suite (from backend/ directory)
pytest -v
```

**Results:** `38 passed in 3.38s`
- **Phase 1 Foundations (10 tests)**: Health endpoints, meeting persistence, whitespace rejection, category and approval enum validations, SQLite schema idempotency.
- **Phase 2 Gemini AI Extraction (8 tests)**: Exact and normalized whitespace evidence verification, raw model validations, transactional re-extraction safety, workspace retrieval endpoints.
- **Phase 3 Human Approval & Firewall (12 tests)**:
  - Pending approval state initialization.
  - Approve action item (`pending` &rarr; `approved`).
  - Category invariance (approved suggestions remain suggestions).
  - Reject action item (`pending` &rarr; `rejected`).
  - State transition enforcement (rejecting re-approving or direct transitions from non-pending states with HTTP 400).
  - Material edit rule (editing title, description, owner, or deadline of approved items automatically resets status to `pending`).
  - Non-material edits and whitespace validation (HTTP 422 on empty title).
  - Commitment Firewall evaluations: `eligible = True` for approved items; `eligible = False` with `block_reason = "approval_pending"` or `"item_rejected"`.
  - Bulk Commitment Firewall evaluation endpoint.
  - Filtering action items by `approval_status`.
  - 404 handling for non-existent items.
- **Phase 4 Execution & Export Engine (8 tests)**:
  - RFC 4180 CSV export generation containing only firewall-cleared commitments with verbatim quote evidence.
  - Structured JSON export schema validation with complete meeting and transcript traceability.
  - Batch export dispatch transitions `execution_status` to `exported` and records `exported_at` timestamp.
  - Commitment Firewall deterministic blocking of unapproved (`pending`) items during batch dispatch with explicit reasons.
  - Single action item export dispatch for approved items (`POST /api/action-items/{task_id}/export`).
  - Commitment Firewall HTTP 400 error rejection when attempting to export unapproved or rejected single items.
  - 404 handling on non-existent item export.
  - Real-time export summary metrics calculation (`GET /api/export/summary`).

```powershell
# Verify frontend production build (from frontend/ directory)
npm run build
```

**Build Output:** Production bundle compiled cleanly in 1.40s without errors (`dist/index.html`, `dist/assets/index-*.css`, `dist/assets/index-*.js`).

---

## SQLite Database Storage Location

Runtime SQLite database files are stored in:
- `backend/data/meet2momentum.db`

The database path can be overridden using the `DATABASE_PATH` environment variable in `.env`.
