from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.security.auth import require_employee, require_manager
from app.agents.approval_store import create_request, list_requests, get_request, decide_request

router = APIRouter(prefix="/approvals", tags=["Approvals"])

class ApprovalRequest(BaseModel):
    request: str
    proposed_action: str | None = None

class ApprovalDecision(BaseModel):
    decision: str
    comment: str = ""

@router.post("/request")
def submit_request(body: ApprovalRequest, user=Depends(require_employee)):
    request_text = body.request.strip()
    if not request_text: raise HTTPException(status_code=400, detail="Request cannot be empty.")
    record = create_request(user["sub"], request_text, body.proposed_action or request_text)
    return {"success": True, "request": record, "message": "Your request has been submitted to the manager for review."}

@router.get("/mine")
def my_requests(user=Depends(require_employee)):
    return {"success": True, "requests": list_requests(requester_id=user["sub"])}

@router.get("/pending")
def pending_requests(user=Depends(require_manager)):
    return {"success": True, "requests": list_requests(status="pending")}

@router.get("/all")
def all_requests(user=Depends(require_manager)):
    return {"success": True, "requests": list_requests()}

@router.post("/respond/{request_id}")
def respond(request_id: str, body: ApprovalDecision, user=Depends(require_manager)):
    decision = body.decision.strip().lower()
    if decision not in {"approved", "rejected"}: raise HTTPException(status_code=400, detail="Decision must be approved or rejected.")
    record = get_request(request_id)
    if not record: raise HTTPException(status_code=404, detail="Approval request not found.")
    if record["requester_id"] == user["sub"]: raise HTTPException(status_code=403, detail="You cannot approve your own request.")
    updated = decide_request(request_id, user["sub"], decision, body.comment)
    if not updated: raise HTTPException(status_code=409, detail="This request has already been reviewed.")
    return {"success": True, "request": updated, "message": f"Request {decision}."}
