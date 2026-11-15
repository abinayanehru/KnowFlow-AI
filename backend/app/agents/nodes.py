from langchain_ollama import ChatOllama
from app.retrieval.vector_store import search_chunks

llm = ChatOllama(model="qwen2.5:1.5b", temperature=0, num_predict=300)


def analyze_query(state):
    return {"search_query": state["question"], "attempts": 0, "documents": [], "sources": [], "answer": "", "relevant": False, "workflow_log": ["Question analyzed"]}


def retrieve_documents(state):
    results = search_chunks(state["search_query"], top_k=5, filename=state.get("filename"))
    target = state.get("filename") or "all uploaded documents"
    return {"documents": results, "workflow_log": state["workflow_log"] + [f"Retrieved {len(results)} chunks from {target}"]}


def grade_retrieval(state):
    documents = state["documents"]
    if not documents:
        return {"relevant": False, "workflow_log": state["workflow_log"] + ["Evidence grading: Insufficient"]}
    context = "\n\n".join(d["text"] for d in documents)
    prompt = f"You are an evidence relevance evaluator.\nQuestion:\n{state['question']}\nEvidence:\n{context}\nDoes the evidence directly answer the question? Reply only YES or NO."
    result = llm.invoke(prompt).content.strip().upper()
    relevant = result.startswith("YES")
    return {"relevant": relevant, "workflow_log": state["workflow_log"] + [f"Evidence grading: {'Relevant' if relevant else 'Insufficient'}"]}


def rewrite_query(state):
    prompt = f"Rewrite as a semantic search query. Return only the query.\nQuestion: {state['question']}"
    rewritten = llm.invoke(prompt).content.strip()
    return {"search_query": rewritten or state["question"], "attempts": state["attempts"] + 1, "workflow_log": state["workflow_log"] + ["Search query rewritten"]}


def generate_answer(state):
    docs = state["documents"]
    if not state["relevant"] or not docs:
        selected = state.get("filename")
        answer = f"I could not find sufficient relevant evidence in {selected} to answer this question." if selected else "I could not find sufficient relevant evidence in the uploaded documents to answer this question."
        return {"answer": answer, "sources": [], "workflow_log": state["workflow_log"] + ["Answer withheld due to insufficient evidence"]}
    context = "\n\n".join(f"Source [{i}]\nFilename: {d['filename']}\nLocation: {d.get('source_location') or 'Document content'}\nContent:\n{d['text']}" for i, d in enumerate(docs, 1))
    prompt = f"You are KnowFlow AI, an enterprise knowledge assistant. Answer using ONLY the evidence below. Do not invent facts or use outside knowledge. Be clear and concise.\n\nQuestion:\n{state['question']}\n\nEvidence:\n{context}\n\nAnswer:"
    answer = llm.invoke(prompt).content.strip()
    sources = [{"source_id": i, "filename": d["filename"], "page_number": d.get("page_number"), "source_location": d.get("source_location", "Document content"), "source_type": d.get("source_type"), "sheet_name": d.get("sheet_name"), "slide_number": d.get("slide_number"), "similarity": d["similarity"], "content_preview": d["text"][:300]} for i, d in enumerate(docs, 1)]
    return {"answer": answer, "sources": sources, "workflow_log": state["workflow_log"] + ["Grounded answer generated"]}
