
from typing import TypedDict, Optional, Dict, Any


class ApprovalState(TypedDict):
    request: str
    proposed_action: Dict[str, Any]
    approval_status: Optional[str]
    approval_comment: Optional[str]
    execution_result: Optional[str]
    workflow_log: list[str]
