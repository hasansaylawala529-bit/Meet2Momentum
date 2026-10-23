import os
from pathlib import Path
from dotenv import load_dotenv

# Base directory for backend
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from backend/.env or root .env if present
backend_env = BASE_DIR / ".env"
root_env = BASE_DIR.parent / ".env"

if backend_env.exists():
    load_dotenv(dotenv_path=backend_env)
elif root_env.exists():
    load_dotenv(dotenv_path=root_env)
else:
    load_dotenv()

# Database Path - default to runtime data directory inside backend/data/
DEFAULT_DB_DIR = BASE_DIR / "data"
DEFAULT_DB_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_PATH = os.getenv("DATABASE_PATH", str(DEFAULT_DB_DIR / "meet2momentum.db"))

BACKEND_HOST = os.getenv("BACKEND_HOST", "127.0.0.1")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))
FRONTEND_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
]

def get_gemini_api_key() -> str:
    """Read latest GEMINI_API_KEY from environment."""
    return os.getenv("GEMINI_API_KEY", "").strip()

def get_gemini_model() -> str:
    """Read latest GEMINI_MODEL from environment, defaulting to gemini-3.1-flash-lite."""
    return os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite").strip() or "gemini-3.1-flash-lite"

# Static properties for initial imports
GEMINI_API_KEY = get_gemini_api_key()
GEMINI_MODEL = get_gemini_model()

# GitHub Project Board Integration Configuration
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "").strip()
GITHUB_REPO = os.getenv("GITHUB_REPO", "hasansaylawala529-bit/Meet2Momentum").strip()


