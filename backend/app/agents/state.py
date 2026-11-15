
from typing import TypedDict, List, Dict, Any, Optional


class AgentState(TypedDict):
    question: str

    # Selected PDF; None means search across all documents
    filename: Optional[str]

    search_query: str
    documents: List[Dict[str, Any]]

    attempts: int
    relevant: bool

    answer: str
    sources: List[Dict[str, Any]]

    workflow_log: List[str]
