# Meet2Momentum

> **"From spoken commitments to verified, approved, trackable execution."**  
> *Core Principle: AI proposes. Humans approve. The system enforces.*

Meet2Momentum is an AI-powered meeting-to-execution automation system built for **HACKNOVA'26 (Problem Statement 4)**. It bridges the gap between conversational commitments in meetings and structured, trackable project delivery.

---

## Phase 2 Scope & Status

This repository is at **Phase 2: Gemini AI Meeting Intelligence**.

### What Works in Phase 2:
- **Google Gemini AI Extraction Engine (`google-genai` SDK)**:
  - Ground-truth meeting outcome extraction using Gemini models (default: `gemini-2.5-flash`).
  - Strict Pydantic-enforced extraction schemas (`MeetingExtractionRaw`, `ExtractedDecisionRaw`, `ExtractedActionItemRaw`).
  - **Evidence Grounding Verification**: Verifies every verbatim transcript quote against the original saved meeting text using exact and whitespace-normalized substring matching. Sets `evidence_verified` flag accordingly without hallucinating or modifying quotes.
  - **Strict Outcome Classification**:
    - `commitment`: Confirmed commitments with explicit agreement or accepted responsibility (e.g., "Riya will complete the login page by Oct 25").
    - `suggestion`: Exploratory ideas without consensus (e.g., "We should consider adding dark mode next week").
    - `unresolved_question`: Open questions, unassigned roles, or pending decisions (e.g., "Who will test the application?").
  - **Nullable Owners and Deadlines**: Unassigned owners or unspecified dates remain explicitly `null` instead of being fabricated. Missing fields automatically trigger `clarification_required = True`.
  - **Transactional Re-extraction Safety**: Re-extracting a meeting cleanly replaces previous decisions and action items for that meeting inside a single SQLite transaction, preventing duplicate records.
  - **Pending Approval Initial State**: In accordance with the core principle (*AI proposes. Humans approve. The system enforces*), all newly extracted items initialize with `approval_status = "pending"`.
- **FastAPI Endpoints (`http://127.0.0.1:8000`)**:
  - `POST /api/meetings/{meeting_id}/extract`: Triggers Gemini extraction on saved transcripts.
  - `GET /api/meetings/{meeting_id}/decisions` & `GET /api/decisions`: Retrieves persisted decisions.
  - `GET /api/meetings/{meeting_id}/action-items` & `GET /api/action-items`: Retrieves persisted action items with category filters.
- **Enhanced Colorful Professional Light Frontend (`http://127.0.0.1:5173`)**:
  - **Meetings Workspace**: One-click "Process with AI" button on meeting cards with live loading spinner, extraction outcome summaries, and card-level error alerts.
  - **Decisions Workspace**: Live decisions log showing meeting associations, supporting rationale, verbatim evidence excerpt boxes, and "Grounded in Transcript" badges (Lavender theme).
  - **Action Items Workspace**: Category filters (`All`, `Confirmed Commitments`, `Suggestions`, `Unresolved Questions`), color-coded badges (Green, Peach, Amber), owner/deadline tags (or amber "Owner needed" / "Deadline needed" badges), clarification warning banners, and transcript quote citations.
  - **Follow-ups Workspace**: Surfaces unresolved questions and items requiring clarification.
  - **Overview Metrics**: Live counters for total meetings, extracted decisions, confirmed commitments, and pending follow-ups.

### Deliberately Deferred to Later Phases:
- Semantic duplicate and conflict detection engine (Phase 3).
- Interactive approval gate / Commitment Firewall execution enforcement (Phase 4).
- CSV/JSON export & GitHub / Trello board sync (Phase 5).


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
│   │   ├── database.py                             # SQLite initialization & CRUD
│   │   ├── models.py                               # Pydantic v2 domain schemas
│   │   └── routers/
│   │       ├── __init__.py
│   │       └── meetings.py                         # Transcript ingestion & retrieval API
│   ├── tests/
│   │   ├── __init__.py
│   │   └── test_phase1.py                          # 10 automated test suites
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
            ├── Navigation.jsx                      # Navigation tabs with phase badges
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

> **Security Note:** Never place credentials in React frontend code, browser requests, or Git-tracked files. The backend reads `GEMINI_API_KEY` strictly from the server environment. If the API key is missing, Phase 1 features remain fully functional, and extraction requests return a safe configuration error rather than crashing.

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

The backend API will be available at:
- API Root: `http://127.0.0.1:8000`
- Health Endpoint: `http://127.0.0.1:8000/api/health`
- Decisions Endpoint: `http://127.0.0.1:8000/api/decisions`
- Action Items Endpoint: `http://127.0.0.1:8000/api/action-items`
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
6. **Human Approval Principle:** Extracted action items initialize in `pending` approval status. AI proposes outcomes, while human approval is preserved for Phase 4.

---

### 6. Running Automated Backend Tests

From the `backend/` directory with the virtual environment activated:

```powershell
pytest -v
```

All 18 automated test suites verify Phase 1 foundation and Phase 2 intelligence:
- Health and status endpoints.
- Meeting persistence and whitespace/empty validation.
- SQLite schema migrations and idempotency.
- Evidence verification algorithms (exact and normalized whitespace matching).
- Pydantic schema validation for commitments, suggestions, and questions.
- Transactional re-extraction safety (prevents duplicate outcomes).
- Safe configuration errors when Gemini API key is absent.
- Workspace-level decisions and action items retrieval endpoints.


---

### 6. Building the Frontend for Production

From the `frontend/` directory:

```powershell
npm run build
```

Production output will be generated into `frontend/dist/` (which is excluded from Git).

---

## SQLite Database Storage Location

Runtime SQLite database files are stored in:
- `backend/data/meet2momentum.db`

The database path can be overridden using the `DATABASE_PATH` environment variable in `.env`.
