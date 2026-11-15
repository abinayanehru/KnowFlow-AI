
import sqlite3
from pathlib import Path

from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from langgraph.checkpoint.sqlite import SqliteSaver

from app.agents.approval_state import ApprovalState


# Store checkpoints inside the backend folder
BASE_DIR = Path(__file__).resolve().parents[2]
DB_PATH = BASE_DIR / "approval_checkpoints.sqlite"

# Persistent SQLite connection
connection = sqlite3.connect(
    str(DB_PATH),
    check_same_thread=False
)

checkpointer = SqliteSaver(connection)
checkpointer.setup()


# NODE 1: Prepare the proposed action
def prepare_action(state: ApprovalState):

    proposed_action = {
        "action_type": "employee_access_policy_update",
        "description": state["request"],
        "target": "Demo employee access policy",
        "status": "Awaiting human approval"
    }

    return {
        "proposed_action": proposed_action,
        "approval_status": "pending",
        "approval_comment": None,
        "execution_result": None,
        "workflow_log": state.get("workflow_log", []) + [
            "Proposed action prepared"
        ]
    }


# NODE 2: Pause and request human approval
def request_human_approval(state: ApprovalState):

    decision = interrupt({
        "message": "Human approval is required before proceeding.",
        "proposed_action": state["proposed_action"],
        "options": ["approve", "reject"]
    })

    approved = (
        isinstance(decision, dict)
        and decision.get("decision") == "approve"
    )

    comment = (
        decision.get("comment", "")
        if isinstance(decision, dict)
        else ""
    )

    return {
        "approval_status": "approved" if approved else "rejected",
        "approval_comment": comment,
        "workflow_log": state.get("workflow_log", []) + [
            f"Human decision: {'Approved' if approved else 'Rejected'}"
        ]
    }


# NODE 3: Execute the approved demonstration action
def execute_action(state: ApprovalState):

    if state["approval_status"] == "approved":

        result = (
            "Demo action completed successfully. "
            "No real employee account or access policy was changed."
        )

        log_message = "Approved demo action executed"

    else:

        result = (
            "Action rejected by the human reviewer. "
            "No action was executed."
        )

        log_message = "Action execution skipped"

    return {
        "execution_result": result,
        "workflow_log": state.get("workflow_log", []) + [
            log_message
        ]
    }


# Build the LangGraph workflow
workflow = StateGraph(ApprovalState)

workflow.add_node("prepare", prepare_action)
workflow.add_node("human_approval", request_human_approval)
workflow.add_node("execute", execute_action)

workflow.add_edge(START, "prepare")
workflow.add_edge("prepare", "human_approval")
workflow.add_edge("human_approval", "execute")
workflow.add_edge("execute", END)

approval_graph = workflow.compile(
    checkpointer=checkpointer
)


# Start an approval workflow
def start_approval(request: str, thread_id: str):

    config = {
        "configurable": {
            "thread_id": thread_id
        }
    }

    initial_state = {
        "request": request,
        "proposed_action": {},
        "approval_status": "pending",
        "approval_comment": None,
        "execution_result": None,
        "workflow_log": []
    }

    return approval_graph.invoke(initial_state, config)


# Resume after human approval or rejection
def resume_approval(
    thread_id: str,
    decision: str,
    comment: str = ""
):

    config = {
        "configurable": {
            "thread_id": thread_id
        }
    }

    return approval_graph.invoke(
        Command(
            resume={
                "decision": decision,
                "comment": comment
            }
        ),
        config
    )
