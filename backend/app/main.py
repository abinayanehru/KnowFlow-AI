from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router as main_router
from app.api.approval_routes import router as approval_router
from app.api.auth_routes import router as auth_router

app = FastAPI(title="KnowFlow AI", description="Enterprise Knowledge Assistant with Agentic RAG", version="1.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(auth_router)
app.include_router(main_router)
app.include_router(approval_router)

@app.get("/health")
def health():
    return {"status": "healthy", "application": "KnowFlow AI", "version": "1.1.0"}
