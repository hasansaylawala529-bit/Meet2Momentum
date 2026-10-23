from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import FRONTEND_ORIGINS
from app.database import init_db
from app.routers.meetings import router as meetings_router
from app.routers.outcomes import decisions_router, action_items_router
from app.routers.export import router as export_router, action_export_router
from app.routers.tracking import tracking_router, action_tracking_router
from app.routers.integrations import router as integrations_router, action_integration_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite tables on startup
    init_db()
    yield


app = FastAPI(
    title="Meet2Momentum API",
    description="Meeting-to-Execution Automation Agent Backend",
    version="1.0.0",
    lifespan=lifespan
)

# Narrow CORS configuration for authorized frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(meetings_router)
app.include_router(decisions_router)
app.include_router(action_items_router)
app.include_router(export_router)
app.include_router(action_export_router)
app.include_router(tracking_router)
app.include_router(action_tracking_router)
app.include_router(integrations_router)
app.include_router(action_integration_router)



@app.get("/api/health")
def health_check():
    """Health check endpoint to verify backend service availability."""
    return {
        "status": "healthy",
        "service": "Meet2Momentum API",
        "version": "1.0.0"
    }
