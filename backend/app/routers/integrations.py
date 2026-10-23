from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.config import GITHUB_TOKEN, GITHUB_REPO
from app.models import ActionItem
from app.services.integrations import (
    create_github_issue,
    dispatch_github_batch,
)
from app.services.firewall import FirewallValidationError, ItemNotFoundError

router = APIRouter(prefix="/api/integrations", tags=["Third-Party Integrations"])
action_integration_router = APIRouter(prefix="/api/action-items", tags=["Action Items Integration"])


class GitHubDispatchRequest(BaseModel):
    task_ids: Optional[List[str]] = Field(None, description="Specific task IDs to dispatch. If omitted, dispatches all firewall-eligible items.")
    repo: Optional[str] = Field(None, description="Target GitHub repository (e.g. 'owner/repo'). Defaults to server configuration.")
    token: Optional[str] = Field(None, description="GitHub personal access token. Defaults to server environment.")


class GitHubSingleDispatchRequest(BaseModel):
    repo: Optional[str] = Field(None, description="Target GitHub repository")
    token: Optional[str] = Field(None, description="GitHub personal access token")


class GitHubConfigResponse(BaseModel):
    configured: bool
    repo: str
    has_token: bool


@router.get("/github/config", response_model=GitHubConfigResponse, summary="Get GitHub integration configuration status")
def get_github_config():
    return GitHubConfigResponse(
        configured=bool(GITHUB_REPO),
        repo=GITHUB_REPO,
        has_token=bool(GITHUB_TOKEN),
    )


@router.post("/github/dispatch", summary="Batch dispatch approved commitments to GitHub Issues")
def dispatch_github_batch_endpoint(payload: Optional[GitHubDispatchRequest] = None):
    try:
        task_ids = payload.task_ids if payload else None
        repo = payload.repo if payload else None
        token = payload.token if payload else None
        return dispatch_github_batch(task_ids=task_ids, repo=repo, token=token)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"GitHub batch dispatch failed: {str(e)}"
        )


@action_integration_router.post(
    "/{task_id}/dispatch-github",
    response_model=ActionItem,
    summary="Dispatch single approved commitment to GitHub Issues",
    description="Gated by the Commitment Firewall. Verifies approval, generates structured issue with verbatim evidence citation, and records GitHub URL."
)
def dispatch_single_github_endpoint(task_id: str, payload: Optional[GitHubSingleDispatchRequest] = None):
    try:
        repo = payload.repo if payload else None
        token = payload.token if payload else None
        result = create_github_issue(task_id=task_id, repo=repo, token=token)
        return ActionItem(**result)
    except ItemNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except FirewallValidationError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to dispatch to GitHub: {str(e)}")
