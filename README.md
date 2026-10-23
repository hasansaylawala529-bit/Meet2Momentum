# Meet2Momentum

> **"From spoken commitments to verified, approved, trackable execution."**  
> *Core Principle: AI proposes. Humans approve. The system enforces.*

Meet2Momentum is an AI-powered meeting-to-execution automation system built for **HACKNOVA'26 (Problem Statement 4)**. It bridges the gap between conversational commitments in meetings and structured, trackable project delivery.

---

## Phase 3 Scope & Status

This repository is at **Phase 3: Human Approval and Commitment Firewall**.

### Core Principle
> **"AI proposes. Humans approve. The system enforces."**

The Gemini AI extraction engine proposes decisions and action items from transcripts, but no AI-proposed item may enter downstream execution without explicit human review and deterministic validation.

---

### What Works in Phase 3:

#### 1. Human Review & Approval Workflow
- **Initial State**: All newly extracted action items from Phase 2 initialize with `approval_status = "pending"`.
- **Allowed State Transitions**:
  - `pending` &rarr; `approved` (via `POST /api/action-items/{task_id}/approve`)
  - `pending` &rarr; `rejected` (via `POST /api/action-items/{task_id}/reject`)
- **Strict Transition Enforcement**: Only items in `pending` status may transition to `approved` or `rejected`. Direct transitions between `approved` and `rejected`, or re-approving an already `approved` item, are rejected by the backend with HTTP 400 (`FirewallValidationError`).
- **Category Invariance**: Approving an exploratory `suggestion` or an `unresolved_question` marks it `approved`, but never mutates its semantic category into a `commitment`.

#### 2. Material Edit Rule (Automatic Re-Approval)
- Users can edit an action item's `title`, `description`, `owner`, or `due_date` via `PATCH /api/action-items/{task_id}`.
- If an item was previously `approved` and any material field (`title`, `description`, `owner`, `due_date`) is modified, the backend **automatically resets its status to `pending`** (`approval_status = "pending"`).
- This prevents execution of altered commitments without renewed human oversight.

#### 3. Deterministic Backend Commitment Firewall
- **Server-Side Verification**: The firewall service (`backend/app/services/firewall.py`) never trusts client-supplied approval assertions; it inspects persisted SQLite state.
- **Eligibility Evaluation (`evaluate_commitment_firewall`)**:
  - **`eligible = True`** (`firewall_status = "eligible"`): Requires `approval_status == "approved"`, non-empty `task_id`, and non-empty `title`.
  - **`eligible = False`** (`firewall_status = "blocked"`):
    - Block reason `"approval_pending"` if item is in `pending` review.
    - Block reason `"item_rejected"` if item was rejected by human reviewer.
    - Block reason `"missing_required_information"` if required fields are missing.
- **Firewall Inspection Endpoints**:
  - `GET /api/action-items/{task_id}/firewall`: Evaluates a single item's firewall status.
  - `GET /api/action-items/firewall/evaluations`: Evaluates all action items in bulk.

#### 4. Frontend Review, Edit & Firewall UI
- **Action Items Workspace**:
  - **Dual Filter Toolbars**: Filter by Category (`All`, `Commitments`, `Suggestions`, `Unresolved Questions`) and Approval Status (`All`, `Pending Review`, `Approved`, `Rejected`).
  - **Approval Badges**: Color-coded badges for `⏳ Pending Review` (Pale Blue), `✓ Approved` (Pale Mint/Green), and `✕ Rejected` (Pale Red).
  - **Firewall Status Badges**: `🛡️ Firewall: Eligible` for approved items; `🛡️ Firewall: Blocked` for pending/rejected items.
  - **Review Action Bar**: For pending items, provides quick-action buttons for "Approve", "Reject" (with inline confirmation prompt), and "Edit".
  - **Inline Editing Mode**: Clean in-place editing form for title, description, owner, and deadline, with an explicit warning hint if editing an approved item.
- **Overview Metrics**: Added a dedicated "PENDING REVIEW" metric card and refined "CONFIRMED COMMITMENTS" with a human approval count.

---

### Deliberately Deferred to Later Phases:
- Execution sync to external tools (GitHub Issues, Trello, Jira) (Phase 4).
- CSV/JSON export and reporting workflows (Phase 5).


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
│   │   │   └── firewall.py                         # Commitment Firewall & approval logic
│   │   └── routers/
│   │       ├── __init__.py
│   │       ├── meetings.py                         # Transcript ingestion, extraction & outcomes
│   │       └── outcomes.py                         # Action item review, editing, firewall & decisions
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_phase1.py                          # 10 automated test suites
│   │   └── test_phase2.py                          # Phase 2 test suite
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

### 5. Meeting Workflow: Capture, Extract & Review

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

---

### 6. Testing & Quality Assurance

All 30 automated backend test suites and the frontend production build have been executed and verified:

```powershell
# Run backend pytest suite (from backend/ directory)
pytest -v
```

**Results:** `30 passed in 2.79s`
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

```powershell
# Verify frontend production build (from frontend/ directory)
npm run build
```

**Build Output:** Production bundle compiled cleanly in 1.50s without errors (`dist/index.html`, `dist/assets/index-*.css`, `dist/assets/index-*.js`).

---

## SQLite Database Storage Location

Runtime SQLite database files are stored in:
- `backend/data/meet2momentum.db`

The database path can be overridden using the `DATABASE_PATH` environment variable in `.env`.
