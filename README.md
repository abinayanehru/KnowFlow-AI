# KnowFlow AI

**Enterprise Knowledge Assistant with Agentic RAG**

KnowFlow AI is a local-first knowledge assistant that ingests business
documents, indexes their content in ChromaDB, retrieves relevant
passages, and generates evidence-grounded answers using locally hosted
Ollama models. It also includes employee/manager role flows and an
approval-request workflow.

> **Version:** 1.1.0\
> **Project status:** Core features were manually tested successfully by
> the project owner in the local development environment. This is not a
> production-security certification.

## Features

-   **Role-based experience:** Employee and Manager dashboards, role
    switching, and browser session restoration.
-   **Approval workflow:** Employees submit requests; managers review,
    approve, or reject them with comments. Self-approval is blocked.
-   **Multi-format ingestion:** PDF, DOCX, TXT, MD, CSV, XLSX, PPTX,
    HTML, JPG, JPEG, and PNG.
-   **Image OCR:** JPG/JPEG/PNG text extraction using Tesseract OCR
    through `pytesseract`.
-   **Vector retrieval:** Text chunks are embedded with Ollama
    `nomic-embed-text` and stored in persistent ChromaDB.
-   **Agentic RAG flow:** LangGraph coordinates query analysis,
    retrieval, evidence grading, query rewriting, and answer generation.
-   **Source references:** Answers can include filename and source
    location such as PDF page, spreadsheet sheet, presentation slide, or
    section.
-   **Local persistence:** ChromaDB stores document vectors; SQLite
    stores approval requests.

## Technology stack

  -----------------------------------------------------------------------
  Layer                               Technology
  ----------------------------------- -----------------------------------
  Frontend                            React, Vite

  Backend API                         Python, FastAPI, Uvicorn

  Agent orchestration                 LangGraph

  LLM runtime                         Ollama

  Answer model                        `qwen2.5:1.5b`

  Embedding model                     `nomic-embed-text`

  Vector database                     ChromaDB

  Approval persistence                SQLite

  OCR                                 Tesseract OCR, `pytesseract`,
                                      Pillow

  Document parsing                    PyMuPDF, python-docx, openpyxl,
                                      python-pptx, BeautifulSoup
  -----------------------------------------------------------------------

## Architecture overview

``` text
React + Vite frontend
        |
        | HTTP / JSON / multipart upload
        v
FastAPI backend
  |-- Authentication routes
  |-- Document routes
  |-- Chat route
  |-- Approval routes
        |
        +--> Ingestion pipeline
        |      |-- PDF / DOCX / TXT / MD
        |      |-- CSV / XLSX / PPTX / HTML
        |      |-- Image OCR (Tesseract)
        |      v
        |    Text extraction -> chunking
        |      -> Ollama embeddings
        |      -> ChromaDB
        |
        +--> LangGraph RAG workflow
        |      Query analysis
        |      -> vector retrieval
        |      -> evidence grading
        |      -> optional query rewrite
        |      -> grounded answer generation
        |
        +--> SQLite approval request store
```

## Prerequisites

-   Python 3.10+ (use a version compatible with the installed
    dependencies)
-   Node.js and npm
-   Ollama installed and running
-   Tesseract OCR installed separately for image OCR
-   Git (recommended)

Pull the local models:

``` bash
ollama pull qwen2.5:1.5b
ollama pull nomic-embed-text
```

The backend expects Ollama to be available locally using its default
service configuration.

## Run locally on Windows

### 1. Backend

Open PowerShell and move into the backend folder:

``` powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

If the project already has a working `.venv`, activate it instead of
creating another one.

Ensure Tesseract is installed and discoverable. If it is not on PATH,
configure `pytesseract.pytesseract.tesseract_cmd` in the image-ingestion
code to the actual `tesseract.exe` location.

Start the API:

``` powershell
uvicorn app.main:app --reload
```

Backend health check: `http://127.0.0.1:8000/health`\
Interactive API docs: `http://127.0.0.1:8000/docs`

### 2. Frontend

Open a second terminal:

``` powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally
`http://localhost:5173`).

## API overview

The backend exposes the following routes (interactive details are
available at `/docs`):

  -----------------------------------------------------------------------------------
  Method                  Endpoint                            Purpose
  ----------------------- ----------------------------------- -----------------------
  GET                     `/health`                           Health and version

  POST                    `/auth/employee`                    Start an employee
                                                              session

  GET                     `/auth/session`                     Validate token and
                                                              return role/user ID

  POST                    `/auth/manager`                     Exchange an
                                                              authenticated employee
                                                              session plus manager
                                                              password for a manager
                                                              session

  POST                    `/documents/upload`                 Upload and index a
                                                              supported document

  GET                     `/documents/count`                  Return indexed chunk
                                                              count

  GET                     `/documents/list`                   List indexed documents

  DELETE                  `/documents/{filename}`             Delete a document and
                                                              its indexed chunks

  POST                    `/documents/search`                 Search indexed chunks

  POST                    `/chat/ask`                         Ask a question against
                                                              uploaded knowledge

  POST                    `/approvals/request`                Submit an approval
                                                              request

  GET                     `/approvals/mine`                   List the current
                                                              employee's requests

  GET                     `/approvals/pending`                List pending manager
                                                              approvals

  GET                     `/approvals/all`                    List all approval
                                                              requests for manager
                                                              review

  POST                    `/approvals/respond/{request_id}`   Approve or reject a
                                                              request
  -----------------------------------------------------------------------------------

Use `/docs` as the source of truth for request schemas and response
payloads.

## Supported files and ingestion notes

  Format             Extraction approach             Source locator
  ------------------ ------------------------------- ----------------------
  PDF                PyMuPDF text extraction         Page number
  DOCX               Paragraphs and tables           Document section
  TXT / MD           UTF-8 text decoding             Text section
  CSV                Row-wise extraction             Row
  XLSX               Worksheet cell extraction       Sheet name
  PPTX               Slide text and tables           Slide number
  HTML               BeautifulSoup text extraction   HTML content section
  JPG / JPEG / PNG   Tesseract OCR                   Image OCR section

The configured maximum upload size is **15 MB**. Image OCR requires the
Tesseract application in addition to the Python `pytesseract` package.
The current PDF extraction path extracts embedded text; scanned-PDF OCR
is not included in the documented update.

## Data and local files

Keep the following local data/configuration when updating source code:

-   `backend/.env` --- local secrets and manager password configuration
-   `backend/chroma_data/` --- persistent ChromaDB data
-   `backend/approval_requests.sqlite` --- approval request records
-   `backend/approval_checkpoints.sqlite` --- separate LangGraph
    checkpoint/demo data, if present
-   `backend/.venv/` --- local Python environment (rebuildable; do not
    commit)

Do not commit `.env`, passwords, tokens, databases containing real
business data, `.venv`, `node_modules`, or generated caches.

## Configuration and security notes

-   Set a strong, unique `SECRET_KEY` in the backend environment. Do not
    use the development fallback.
-   Do not commit `.env` or expose the manager password/hash.
-   The current manager identity is a shared demo principal
    (`knowflow-manager`), and employee sessions are browser/demo
    oriented. Replace this with individual accounts and a proper
    identity provider before multi-user production use.
-   Review route-level authorization before deployment. The current
    implementation protects chat and approval operations, but document
    upload/list/count/search/delete routes should be placed behind
    appropriate authentication and role/tenant authorization before
    exposing the service beyond a trusted local demo.
-   Add file-content validation, malware scanning, rate limiting, audit
    logging, HTTPS, secret management, backups, and tenant-aware
    document isolation before production deployment.
-   Treat retrieved documents as untrusted input. Keep access controls
    around documents and avoid exposing sensitive source snippets to
    unauthorized users.

## Testing checklist

The project owner reported successful local testing of:

-   Employee and manager login, role switching, and role persistence
    after refresh
-   Approval submission, manager review, approve/reject, persistence,
    and self-approval prevention
-   Supported document uploads, including image OCR
-   RAG responses and source references
-   Document management and existing dashboard/chat functionality

For a repeatable test, use non-sensitive sample files and verify the
answer against the original source. Test unauthorized requests and
cross-user document access separately before any deployment.

## Known scope and limitations

-   This is a local development/demo configuration, not a hardened
    production deployment.
-   The manager role is shared in the current demo implementation.
-   The approval request API is SQLite-backed; the separate LangGraph
    interrupt/checkpoint demonstration remains a distinct workflow.
-   OCR is currently for image uploads; scanned PDF OCR is not included
    in this update.
-   The local model names and Ollama service must be available on the
    machine running the backend.

## Suggested repository hygiene

Example `.gitignore` entries:

``` gitignore
.env
.venv/
venv/
__pycache__/
*.py[cod]
node_modules/
dist/
chroma_data/
*.sqlite
*.db
.DS_Store
```

Review database ignore rules before committing if you intentionally
maintain sanitized demo fixtures.

## License

Add the license selected for this project before publishing it publicly.
