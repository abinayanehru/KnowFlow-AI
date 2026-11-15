
from langgraph.graph import StateGraph, END

from app.agents.state import AgentState

from app.agents.nodes import (
    analyze_query,
    retrieve_documents,
    grade_retrieval,
    rewrite_query,
    generate_answer
)


def route_after_grading(state):
    if state["relevant"]:
        return "generate"

    if state["attempts"] < 1:
        return "rewrite"

    return "generate"


workflow = StateGraph(AgentState)

workflow.add_node("analyze", analyze_query)
workflow.add_node("retrieve", retrieve_documents)
workflow.add_node("grade", grade_retrieval)
workflow.add_node("rewrite", rewrite_query)
workflow.add_node("generate", generate_answer)

workflow.set_entry_point("analyze")

workflow.add_edge("analyze", "retrieve")
workflow.add_edge("retrieve", "grade")

workflow.add_conditional_edges(
    "grade",
    route_after_grading,
    {
        "generate": "generate",
        "rewrite": "rewrite"
    }
)

workflow.add_edge("rewrite", "retrieve")
workflow.add_edge("generate", END)

agent = workflow.compile()


def run_agent(question: str, filename: str = None):
    initial_state = {
        "question": question,
        "filename": filename,
        "search_query": question,
        "documents": [],
        "attempts": 0,
        "relevant": False,
        "answer": "",
        "sources": [],
        "workflow_log": []
    }

    result = agent.invoke(initial_state)

    return result
