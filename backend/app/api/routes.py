from pathlib import Path
import re
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from pydantic import BaseModel
from app.ingestion.pdf_loader import extract_document_text
from app.ingestion.chunking import split_into_chunks
from app.retrieval.vector_store import store_chunks, get_document_count, get_uploaded_documents, search_chunks, delete_document
from app.agents.graph import run_agent
from app.security.auth import require_employee
from app.agents.approval_store import create_request

router = APIRouter()
MAX_FILE_SIZE = 15 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md", ".csv", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png", ".html"}


@router.post("/documents/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="A filename is required.")
    filename = Path(file.filename).name
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Supported: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
    file_bytes = await file.read()
    if not file_bytes: raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(file_bytes) > MAX_FILE_SIZE: raise HTTPException(status_code=413, detail="Maximum upload size is 15 MB.")
    try:
        units = extract_document_text(file_bytes, filename)
        chunks = split_into_chunks(units, chunk_size=800, overlap=100)
        stored = store_chunks(chunks, filename)
        return {"success": True, "filename": filename, "pages_processed": len(units), "chunks": stored, "chunks_created": stored, "total_chunks_in_database": get_document_count(), "message": "Document successfully indexed."}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Document processing failed: {exc}")


@router.get("/documents/count")
def document_count():
    count = get_document_count()
    return {"count": count, "total_chunks": count}


@router.get("/documents/list")
def list_documents():
    return {"success": True, "documents": get_uploaded_documents()}


@router.delete("/documents/{filename}")
def remove_document(filename: str):
    existing = {doc["filename"] for doc in get_uploaded_documents()}
    if filename not in existing: raise HTTPException(status_code=404, detail="Document not found.")
    delete_document(filename)
    return {"success": True, "filename": filename, "message": "Document removed."}


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


@router.post("/documents/search")
def search_documents(request: SearchRequest):
    if not request.query.strip(): raise HTTPException(status_code=400, detail="Search query cannot be empty.")
    if not 1 <= request.top_k <= 10: raise HTTPException(status_code=400, detail="top_k must be between 1 and 10.")
    try:
        results = search_chunks(request.query, request.top_k)
        return {"success": True, "query": request.query, "results_found": len(results), "results": results}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}")


class ChatRequest(BaseModel):
    question: str
    filename: str | None = None


def explicit_approval_intent(question: str) -> bool:
    patterns = [r"\b(approve|approval|authorize|authorise)\b", r"\b(please|can you|could you)\s+(approve|authorize|authorise)\b", r"\bsubmit.*for approval\b"]
    return any(re.search(pattern, question, re.IGNORECASE) for pattern in patterns)


@router.post("/chat/ask")
def ask_question(request: ChatRequest, user=Depends(require_employee)):
    if not request.question.strip(): raise HTTPException(status_code=400, detail="Question cannot be empty.")
    if request.filename and request.filename not in {d["filename"] for d in get_uploaded_documents()}:
        raise HTTPException(status_code=404, detail="Selected document was not found in the knowledge base.")
    try:
        result = run_agent(request.question, filename=request.filename)
        approval_submitted = False
        if explicit_approval_intent(request.question) and result.get("relevant"):
            create_request(user["sub"], request.question, request.question)
            approval_submitted = True
        return {"success": True, "question": request.question, "selected_document": request.filename, "answer": result["answer"], "sources": result["sources"], "agent_workflow": result["workflow_log"], "retrieval_attempts": result["attempts"], "evidence_relevant": result["relevant"], "approval_submitted": approval_submitted}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Agent execution failed: {exc}")
