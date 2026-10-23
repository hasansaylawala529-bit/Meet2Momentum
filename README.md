# Meet2Momentum

> **"From spoken commitments to verified, approved, trackable execution."**  
> *Core Principle: AI proposes. Humans approve. The system enforces.*

Meet2Momentum is an AI-powered meeting-to-execution automation system built for **HACKNOVA'26 (Problem Statement 4)**. It bridges the gap between conversational commitments in meetings and structured, trackable project delivery.

---

## Phase 1 Scope & Status

This repository is currently at **Phase 1: Secure Foundation, Backend & Professional Light Frontend**.

### What Works in Phase 1:
- **FastAPI Backend (`http://127.0.0.1:8000`)**:
  - Live health check endpoint (`GET /api/health`).
  - Transcript ingestion endpoint (`POST /api/meetings`) with Pydantic validation (rejects empty/whitespace text).
  - Meeting history retrieval endpoint (`GET /api/meetings`).
  - Strict Pydantic domain models for Meetings, Decisions, and Action Items (with category validation: `commitment`, `suggestion`, `unresolved_question` and approval states: `pending`, `approved`, `rejected`).
  - Idempotent SQLite schema initialization (`meetings`, `decisions`, `action_items` tables).
- **React + Vite Frontend (`http://127.0.0.1:5173`)**:
  - Strict professional light theme (page `#F7F9FC`, panels `#FFFFFF`, brand blue `#2563EB`, zero dark-mode surfaces).
  - Real-time backend API connectivity status badge.
  - Interactive transcript intake: manual notes entry, one-click demo presets, and plain text (`.txt`) file uploads with in-browser text reading.
  - Direct round-trip persistence to SQLite and live Meeting History updates.
  - Honest tab navigation displaying Phase 2 roadmap for automated action item extraction.
- **Security & Repository Safety**:
  - Comprehensive `.gitignore` protecting `.env`, virtual environments, SQLite database files (`*.db`), `node_modules/`, and cache directories.
  - Safe `.env.example` template with placeholders only.

### Deliberately Deferred to Later Phases:
- Google Gemini API extraction (Phase 2).
- Automatic commitment classification into commitments vs suggestions vs unresolved questions (Phase 2).
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

### 2. Environment Configuration
Copy the template to create `.env`:
```powershell
cp .env.example .env
```
*(Keep your `.env` private; it is excluded from Git.)*

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

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The backend API will be available at:
- API Root: `http://127.0.0.1:8000`
- Health Endpoint: `http://127.0.0.1:8000/api/health`
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

### 5. Running Automated Backend Tests

From the `backend/` directory with the virtual environment activated:

```powershell
pytest -v tests/test_phase1.py
```

All 10 test cases run against an isolated temporary SQLite database:
1. Health endpoint status verification (`/api/health`).
2. Valid meeting ingestion and field persistence.
3. Rejection of empty transcript strings (422 Unprocessable Entity).
4. Rejection of whitespace-only transcript strings.
5. Strict Pydantic rejection of invalid action item categories.
6. Strict Pydantic rejection of invalid approval statuses.
7. Repeatable SQLite schema initialization (`meetings`, `decisions`, `action_items`).
8. Meeting record persistence and retrieval by ID.
9. Idempotency test (re-initializing DB does not erase existing records).
10. Proper HTTP 422/404 error responses for invalid payloads and missing IDs.

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
