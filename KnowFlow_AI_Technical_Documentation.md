# KnowFlow AI --- Technical Project Documentation

**Version:** 1.1.0\
**Document type:** Technical overview, setup guide, architecture, and
test record

## 1. Project summary

KnowFlow AI is an enterprise knowledge assistant built around
retrieval-augmented generation (RAG). Users upload documents into a
knowledge base. The backend extracts text, divides it into chunks,
generates vector embeddings, and persists those vectors in ChromaDB.
When a user asks a question, an agent workflow retrieves relevant
chunks, evaluates whether the evidence is sufficient, optionally
rewrites the search query, and generates an answer grounded in the
retrieved content.

The application also provides employee/manager role experiences and an
approval-request workflow.

## 2. Objectives

-   Make information in uploaded business documents searchable through
    natural-language questions.
-   Support multiple common office and text formats, plus image OCR.
-   Return answers with document and location references.
-   Provide an employee-to-manager approval workflow.
-   Preserve local document and approval data between application
    restarts.

## 3. System components

### 3.1 Frontend

The React/Vite frontend provides the application interface,
role-specific dashboards, document upload and management, chat, and
approval views. It communicates with the FastAPI backend over HTTP.

### 3.2 FastAPI backend

The backend exposes authentication, document, chat, and approval
endpoints. It validates upload extensions and enforces a 15 MB upload
limit in the document upload route.

### 3.3 Ingestion pipeline

1.  Receive an uploaded file.
2.  Validate filename, extension, non-empty content, and size.
3.  Extract text using the parser appropriate to the file type.
4.  Attach source metadata such as page, sheet, slide, or section.
5.  Split extracted text into chunks (configured as 800 characters with
    100-character overlap in the upload route).
6.  Generate embeddings with Ollama `nomic-embed-text`.
7.  Store chunk text, embeddings, and metadata in ChromaDB.

### 3.4 Retrieval and agent workflow

The LangGraph workflow uses these stages:

1.  **Analyze:** initialize the user's question as the search query.
2.  **Retrieve:** retrieve up to five candidate chunks from ChromaDB.
3.  **Grade:** use the configured local chat model to assess whether the
    evidence directly answers the question.
4.  **Rewrite:** if evidence is insufficient on the first attempt,
    rewrite the query and retrieve again.
5.  **Generate:** answer using only the retrieved evidence; if evidence
    remains insufficient, withhold a substantive answer.

The configured answer/evidence model is `qwen2.5:1.5b`. The embedding
model is `nomic-embed-text`. Both are served through Ollama.

### 3.5 Source metadata

The vector store preserves filename and source type, and supports
locators including:

-   PDF: page number
-   XLSX: worksheet name
-   PPTX: slide number
-   DOCX, TXT, MD, HTML, and images: section label where available
-   CSV: row label

Existing PDF records using `filename` and `page_number` metadata remain
compatible with the updated retrieval logic.

### 3.6 Approval workflow

The approval API uses SQLite storage. An approval record includes a
request ID, requester ID, request text, proposed action, status,
reviewer ID, comment, and timestamps.

Workflow:

1.  Employee submits a request.
2.  The request is stored with `pending` status.
3.  Manager views pending or all requests.
4.  Manager approves or rejects and may add a comment.
5.  The record stores reviewer identity and decision timestamps.
6.  A requester cannot approve their own request; decisions are accepted
    only while the request remains pending.

The LangGraph interrupt/checkpoint demonstration is separate from this
SQLite approval queue.

## 4. High-level architecture

``` text
                 +---------------------------+
                 |      React + Vite UI       |
                 | Dashboards / Chat / Files  |
                 |       Approvals            |
                 +-------------+-------------+
                               |
                               v
                 +---------------------------+
                 |       FastAPI API          |
                 | Auth | Documents | Chat    |
                 |          Approvals        |
                 +---+-----------+-----------+
                     |           |
          +----------+           +------------------+
          |                                         |
          v                                         v
+----------------------+                 +----------------------+
| Document ingestion   |                 | Approval service     |
| PDF/DOCX/TXT/MD      |                 | SQLite request store |
| CSV/XLSX/PPTX/HTML   |                 +----------------------+
| Image OCR            |
+----------+-----------+
           |
           v
+----------------------+
| Text extraction      |
| + chunking           |
+----------+-----------+
           |
           v
+----------------------+
| Ollama embeddings    |
| nomic-embed-text     |
+----------+-----------+
           |
           v
+----------------------+
| Persistent ChromaDB  |
+----------+-----------+
           |
           v
+----------------------+
| LangGraph RAG agent  |
| Retrieve / Grade     |
| Rewrite / Generate   |
+----------+-----------+
           |
           v
+----------------------+
| Ollama chat model    |
| qwen2.5:1.5b         |
+----------------------+
```

## 5. API reference summary

  ------------------------------------------------------------------------------------------
  Method            Path                                Access intent     Description
  ----------------- ----------------------------------- ----------------- ------------------
  GET               `/health`                           Public health     Returns
                                                        check             application status
                                                                          and version

  POST              `/auth/employee`                    Starts employee   Issues employee
                                                        session           token

  GET               `/auth/session`                     Authenticated     Returns role and
                                                                          subject from
                                                                          bearer token

  POST              `/auth/manager`                     Employee bearer + Issues manager
                                                        manager password  token

  POST              `/documents/upload`                 Document route    Uploads and
                                                                          indexes a file

  GET               `/documents/count`                  Document route    Returns chunk
                                                                          count

  GET               `/documents/list`                   Document route    Lists indexed
                                                                          filenames and
                                                                          chunk counts

  DELETE            `/documents/{filename}`             Document route    Removes indexed
                                                                          chunks for a
                                                                          filename

  POST              `/documents/search`                 Document route    Returns nearest
                                                                          matching chunks

  POST              `/chat/ask`                         Employee token    Runs the RAG agent

  POST              `/approvals/request`                Employee token    Creates an
                                                                          approval request

  GET               `/approvals/mine`                   Employee token    Lists the
                                                                          employee's
                                                                          requests

  GET               `/approvals/pending`                Manager token     Lists pending
                                                                          requests

  GET               `/approvals/all`                    Manager token     Lists all requests

  POST              `/approvals/respond/{request_id}`   Manager token     Approves/rejects a
                                                                          request
  ------------------------------------------------------------------------------------------

The FastAPI OpenAPI page at `/docs` provides the exact live schemas. The
table is a route overview, not a substitute for the generated API
specification.

## 6. Local installation and execution

### Requirements

-   Python environment for backend dependencies
-   Node.js/npm for frontend
-   Ollama runtime
-   Ollama models `qwen2.5:1.5b` and `nomic-embed-text`
-   Tesseract OCR executable for image OCR

### Backend setup (PowerShell)

``` powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
ollama pull qwen2.5:1.5b
ollama pull nomic-embed-text
uvicorn app.main:app --reload
```

If no virtual environment exists, create it first:

``` powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### Frontend setup

``` powershell
cd frontend
npm install
npm run dev
```

### Local URLs

-   Frontend: Vite prints the exact local URL (normally
    `http://localhost:5173`).
-   Backend health: `http://127.0.0.1:8000/health`.
-   API documentation: `http://127.0.0.1:8000/docs`.

## 7. Environment and data management

Keep secrets in `backend/.env`. At minimum, configure a strong
`SECRET_KEY` and the manager password or supported password hash setting
used by the authentication module. Never place real secrets in source
control.

Persistent data locations in the supplied update structure:

-   ChromaDB: `backend/chroma_data/`
-   Approval request database: `backend/approval_requests.sqlite`
-   Optional separate checkpoint database:
    `backend/approval_checkpoints.sqlite`

Back up these data stores before upgrades. Do not replace them with
empty folders or sample databases during a source-code update.

## 8. Functional test record

The project owner reported that the following local checks completed
successfully after the update:

-   Employee login and manager login
-   Role switching in both directions
-   Role/session persistence after browser refresh
-   Approval request creation and employee request listing
-   Manager pending/all request views
-   Approval and rejection
-   Approval persistence after refresh
-   Prevention of self-approval
-   PDF and image upload
-   Image OCR extraction in the frontend upload flow
-   DOCX, TXT, MD, CSV, XLSX, PPTX, and HTML upload
-   RAG question answering and source references
-   Document listing/deletion and existing dashboard/chat behavior

This is a user-reported functional test record. It does not represent an
independently executed automated test suite, penetration test, load
test, or production-readiness review.

## 9. Security review and production-readiness gaps

The current code should be treated as a local demo until the following
are addressed:

1.  **Protect document endpoints:** In the current route implementation,
    upload, count, list, delete, and search handlers do not all enforce
    authentication. Add authentication and role checks to every document
    operation.
2.  **Replace shared manager identity:** Use individual employee and
    manager accounts, secure password storage, account lifecycle
    controls, and a proper identity provider.
3.  **Tenant/document authorization:** Ensure users can only retrieve,
    list, or delete documents they are authorized to access. Add
    tenant-aware metadata filters and authorization checks.
4.  **Secret configuration:** Replace the development `SECRET_KEY`
    fallback with a required high-entropy secret and rotate any exposed
    secrets.
5.  **Upload security:** Validate actual file content and MIME type,
    consider malware scanning, limit decompression/resource use, and
    handle parser errors safely.
6.  **Operational controls:** Add HTTPS, rate limiting, audit logs,
    structured error handling, monitoring, backups, and retention
    policies.
7.  **RAG safety:** Treat document text as untrusted content; guard
    against prompt injection and sensitive data disclosure.
8.  **Automated tests:** Add API tests for authorization boundaries,
    upload edge cases, approval concurrency, document isolation, and
    retrieval quality.

Do not describe the application as production-secure until these
controls have been implemented and independently tested.

## 10. Future enhancements

-   Individual user accounts and organization/tenant management
-   Role- and document-level access control
-   Scanned PDF OCR
-   Better table and layout extraction
-   Automated test suite and CI pipeline
-   Document versioning and re-indexing
-   Audit history and admin reporting
-   Deployment using containers and managed infrastructure

## 11. Version notes --- 1.1.0

The update introduced or coordinated: - Separate employee and manager
token storage/session handling in the frontend - Employee-to-manager
login flow - SQLite-backed approval request endpoints - Multi-format
document extraction - Image OCR using Tesseract - Source metadata for
page/sheet/slide/section references - Compatibility handling for
existing PDF metadata and approval database records

Existing `.env`, ChromaDB data, approval databases, and the local
virtual environment should be preserved during source updates.
