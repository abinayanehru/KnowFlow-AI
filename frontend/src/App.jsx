import { useEffect, useState } from "react";
import "./App.css";

const API = "http://127.0.0.1:8000";

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("knowflow_theme") || "light"
  );
  const [status, setStatus] = useState("Checking...");
  const [documentCount, setDocumentCount] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [selectedFilename, setSelectedFilename] = useState("");
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [role, setRole] = useState("employee");
  const [token, setToken] = useState("");
  const [sessionLoading, setSessionLoading] = useState(true);
  const [approvalRequests, setApprovalRequests] = useState([]);
  const [approvalMessage, setApprovalMessage] = useState("");
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [manualApprovalRequest, setManualApprovalRequest] = useState("");
  const [manualApprovalSubmitting, setManualApprovalSubmitting] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [folder, setFolder] = useState("All documents");
  const [showManagerLogin, setShowManagerLogin] = useState(false);
  const [managerPassword, setManagerPassword] = useState("");
  const [managerLoginError, setManagerLoginError] = useState("");
  const [managerLoginLoading, setManagerLoginLoading] = useState(false);
  const [documentToRemove, setDocumentToRemove] = useState(""); 

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("knowflow_theme", theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme((current) => (current === "light" ? "dark" : "light"));

  const authHeaders = () => ({
    Authorization: `Bearer ${token}`,
  });

  const jsonHeaders = () => ({
    ...authHeaders(),
    "Content-Type": "application/json",
  });

  const initializeSession = async () => {
    setSessionLoading(true);
    try {
      const preferredRole = localStorage.getItem("knowflow_active_role") || localStorage.getItem("knowflow_role") || "employee";
      const managerToken = localStorage.getItem("knowflow_manager_token");
      const employeeToken = localStorage.getItem("knowflow_employee_token") || localStorage.getItem("knowflow_token");
      const candidateToken = preferredRole === "manager" ? managerToken : employeeToken;

      if (candidateToken) {
        const response = await fetch(`${API}/auth/session`, {
          headers: { Authorization: `Bearer ${candidateToken}` },
        });
        if (response.ok) {
          const session = await response.json();
          // Do not restore a token under the wrong role.
          if (session.role === preferredRole) {
            setToken(candidateToken);
            setRole(session.role);
            localStorage.setItem(session.role === "manager" ? "knowflow_manager_token" : "knowflow_employee_token", candidateToken);
            localStorage.setItem("knowflow_active_role", session.role);
            localStorage.setItem("knowflow_role", session.role);
            return;
          }
        }
      }

      // If the saved manager token expired, fall back to the employee session.
      if (preferredRole === "manager" && employeeToken) {
        const response = await fetch(`${API}/auth/session`, { headers: { Authorization: `Bearer ${employeeToken}` } });
        if (response.ok) {
          const session = await response.json();
          if (session.role === "employee") {
            setToken(employeeToken);
            setRole("employee");
            setActivePage("Dashboard");
            localStorage.setItem("knowflow_active_role", "employee");
            localStorage.setItem("knowflow_role", "employee");
            return;
          }
        }
      }

      const response = await fetch(`${API}/auth/employee`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not create an employee session.");
      setToken(data.access_token);
      setRole("employee");
      setActivePage("Dashboard");
      localStorage.setItem("knowflow_employee_token", data.access_token);
      localStorage.setItem("knowflow_token", data.access_token);
      localStorage.setItem("knowflow_active_role", "employee");
      localStorage.setItem("knowflow_role", "employee");
    } catch (error) {
      console.error("Session initialization failed:", error);
    } finally {
      setSessionLoading(false);
    }
  };

  const checkBackend = async () => {
    try {
      const response = await fetch(`${API}/health`);
      if (!response.ok) throw new Error();
      setStatus("Backend Connected");
    } catch {
      setStatus("Backend Offline");
    }
  };

  useEffect(() => {
    initializeSession();
    checkBackend();
  }, []);

  useEffect(() => {
  if (role === "manager") {
    setActivePage("Approvals");
  }
}, [role]);

  useEffect(() => {
    if (token) {
      fetchDocumentCount();
      fetchUploadedDocuments();
      fetchApprovals();
    }
  }, [token, role]);

  const fetchDocumentCount = async () => {
    try {
      const response = await fetch(`${API}/documents/count`, {
        headers: authHeaders(),
      });
      const data = await response.json();
      if (response.ok) setDocumentCount(data.count ?? data.total_chunks ?? 0);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchUploadedDocuments = async () => {
    try {
      const response = await fetch(`${API}/documents/list`, {
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not load documents.");

      const docs = data.documents || [];
      setUploadedDocuments(docs);
      setSelectedFilename((current) =>
        current && docs.some((doc) => doc.filename === current) ? current : ""
      );
    } catch (error) {
      console.error(error);
    }
  };

  const uploadDocument = async () => {
    if (!selectedFile) {
      setUploadMessage("Please select a file first.");
      return;
    }

    const allowedExtensions = [".pdf", ".docx", ".txt", ".md", ".csv", ".xlsx", ".pptx", ".jpg", ".jpeg", ".png", ".html"];
    const extension = selectedFile.name.toLowerCase().slice(selectedFile.name.lastIndexOf("."));
    if (!allowedExtensions.includes(extension)) {
      setUploadMessage("Unsupported file type. Choose PDF, DOCX, TXT, MD, CSV, XLSX, PPTX, JPG, JPEG, PNG or HTML.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    setUploading(true);
    setUploadMessage("");

    try {
      const response = await fetch(`${API}/documents/upload`, {
        method: "POST",
        headers: authHeaders(),
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Upload failed.");

      setUploadMessage(`${data.filename} was successfully indexed.`);
      setSelectedFile(null);
      const input = document.getElementById("pdf-upload");
      if (input) input.value = "";
      setSelectedFilename(data.filename);

      await fetchDocumentCount();
      await fetchUploadedDocuments();
    } catch (error) {
      setUploadMessage(error.message);
    }
    setUploading(false);
  };

  const removeDocument = async (filename) => {
  setDocumentToRemove(filename);
};

const confirmRemoveDocument = async () => {
  const filename = documentToRemove;
  if (!filename || deleting) return;

  setDeleting(filename);

  try {
    const response = await fetch(
      `${API}/documents/${encodeURIComponent(filename)}`,
      { method: "DELETE", headers: authHeaders() }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Could not remove document.");
    }

    if (selectedFilename === filename) setSelectedFilename("");

    await fetchUploadedDocuments();
    await fetchDocumentCount();

    setUploadMessage(`${filename} was removed from your Library.`);
    setDocumentToRemove("");
  } catch (error) {
    setUploadMessage(error.message);
  }

  setDeleting("");
};

  const askQuestion = async (event) => {
    event.preventDefault();
    if (!question.trim() || chatLoading) return;

    const userQuestion = question.trim();
    setMessages((prev) => [...prev, { role: "user", content: userQuestion }]);
    setQuestion("");
    setChatLoading(true);

    try {
      const response = await fetch(`${API}/chat/ask`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          question: userQuestion,
          filename: selectedFilename || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "AI request failed.");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer },
      ]);

      if (data.approval_submitted) fetchApprovals();
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, something went wrong: ${error.message}`,
        },
      ]);
    }
    setChatLoading(false);
  };

  const switchRole = async () => {
    if (role === "employee") {
      setManagerPassword("");
      setManagerLoginError("");
      setShowManagerLogin(true);
      return;
    }

    try {
      let employeeToken = localStorage.getItem("knowflow_employee_token");
      if (!employeeToken) {
        const response = await fetch(`${API}/auth/employee`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Could not restore employee session.");
        employeeToken = data.access_token;
        localStorage.setItem("knowflow_employee_token", employeeToken);
      }
      const verify = await fetch(`${API}/auth/session`, { headers: { Authorization: `Bearer ${employeeToken}` } });
      if (!verify.ok) throw new Error("Your employee session expired. Please refresh and sign in again.");
      setToken(employeeToken);
      setRole("employee");
      setActivePage("Dashboard");
      localStorage.setItem("knowflow_token", employeeToken);
      localStorage.setItem("knowflow_active_role", "employee");
      localStorage.setItem("knowflow_role", "employee");
      setApprovalMessage("");
    } catch (error) {
      setApprovalMessage(error.message);
    }
  };


const submitManagerLogin = async (event) => {
  event.preventDefault();

  if (!managerPassword.trim() || managerLoginLoading) return;

  setManagerLoginLoading(true);
  setManagerLoginError("");

  try {
    // Get the employee token directly from browser storage.
    let employeeToken = localStorage.getItem("knowflow_employee_token");

    // Support the older token key as a fallback.
    if (!employeeToken) {
      employeeToken = localStorage.getItem("knowflow_token");
    }

    // If no employee session exists, create one.
    if (!employeeToken) {
      const employeeResponse = await fetch(`${API}/auth/employee`, {
        method: "POST",
      });

      const employeeData = await employeeResponse.json();

      if (!employeeResponse.ok) {
        throw new Error(
          employeeData.detail || "Could not create employee session."
        );
      }

      employeeToken = employeeData.access_token;

      localStorage.setItem("knowflow_employee_token", employeeToken);
      localStorage.setItem("knowflow_token", employeeToken);
    }

    // Verify that the employee token is valid.
    const sessionResponse = await fetch(`${API}/auth/session`, {
      headers: {
        Authorization: `Bearer ${employeeToken}`,
      },
    });

    const sessionData = await sessionResponse.json();

    if (!sessionResponse.ok || sessionData.role !== "employee") {
      throw new Error(
        "Employee session is invalid. Please refresh and try again."
      );
    }

    // Authenticate as manager using the verified employee token.
    const response = await fetch(`${API}/auth/manager`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${employeeToken}`,
      },
      body: JSON.stringify({
        password: managerPassword,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Manager login failed.");
    }

    // Preserve both identities separately.
    localStorage.setItem("knowflow_employee_token", employeeToken);
    localStorage.setItem("knowflow_manager_token", data.access_token);
    localStorage.setItem("knowflow_active_role", "manager");
    localStorage.setItem("knowflow_role", "manager");

    setToken(data.access_token);
    setRole("manager");
    setActivePage("Approvals");

    setShowManagerLogin(false);
    setManagerPassword("");
    setApprovalMessage("");

  } catch (error) {
    setManagerLoginError(error.message);
  } finally {
    setManagerLoginLoading(false);
  }
};

  const fetchApprovals = async () => {
    if (!token) return;
    try {
      const endpoint = role === "manager" ? "/approvals/all" : "/approvals/mine";
      const response = await fetch(`${API}${endpoint}`, {
        headers: authHeaders(),
      });
      const data = await response.json();
      if (response.ok) setApprovalRequests(data.requests || []);
    } catch (error) {
      console.error("Could not load approvals:", error);
    }
  };

  const submitManualApprovalRequest = async (event) => {
    event.preventDefault();
    const request = manualApprovalRequest.trim();
    if (!request || manualApprovalSubmitting) return;

    setManualApprovalSubmitting(true);
    setApprovalMessage("");

    try {
      const response = await fetch(`${API}/approvals/request`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ request }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Could not submit your approval request.");
      }

      setManualApprovalRequest("");
      setApprovalMessage(
        data.message || "Your request has been submitted to the manager for review."
      );
      await fetchApprovals();
    } catch (error) {
      setApprovalMessage(error.message);
    } finally {
      setManualApprovalSubmitting(false);
    }
  };

  const decideApproval = async (requestId, decision) => {
    const comment = window.prompt("Optional comment:", "") ?? "";
    setApprovalLoading(true);
    setApprovalMessage("");

    try {
      const response = await fetch(`${API}/approvals/respond/${requestId}`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ decision, comment }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Decision failed.");

      setApprovalMessage(`Request ${decision}.`);
      await fetchApprovals();
    } catch (error) {
      setApprovalMessage(error.message);
    }
    setApprovalLoading(false);
  };

  const pageDescriptions = {
    Dashboard: "Your intelligent workspace for enterprise knowledge.",
    Library: "Your documents, organised in one searchable knowledge space.",
    "AI Assistant": "Ask questions. Get clear answers from your documents.",
    Approvals: "Review and manage requests that need a decision.",
  };

  const employeeNavItems = [
  { name: "Dashboard", icon: "⌂" },
  { name: "Library", icon: "▤" },
  { name: "AI Assistant", icon: "✦" },
  { name: "Approvals", icon: "✓" },
];

const navItems =
  role === "manager"
    ? [{ name: "Approvals", icon: "✓" }]
    : employeeNavItems;

  const renderDashboard = () => (
    <div className="page-stack dashboard-page">
      <section className="dashboard-hero">
        <div className="hero-copy">
          <span className="eyebrow">YOUR KNOWLEDGE, CONNECTED</span>
          <h2>Make knowledge<br />work <em>smarter.</em></h2>
          <p>
            One intelligent space for your documents, answers and
            everyday decisions.
          </p>
          <button className="button-primary" onClick={() => setActivePage("AI Assistant")}>
            Talk to your AI <span>↗</span>
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-orbit orbit-a"></div>
          <div className="hero-orbit orbit-b"></div>
          <div className="hero-orbit orbit-c"></div>
          <div className="hero-glow"></div>
          <div className="hero-core">K<span>✦</span></div>
          <div className="hero-float float-a">✧ &nbsp; KNOWLEDGE</div>
          <div className="hero-float float-b">PDF&nbsp; → &nbsp;AI&nbsp; → &nbsp;ANSWERS</div>
        </div>
        <span className="hero-caption">KNOWFLOW AI / 01</span>
      </section>

      <div className="section-heading">
        <div><span className="eyebrow">OVERVIEW</span><h2>Your workspace at a glance</h2></div>
        <span className="live-indicator"><i /> LIVE WORKSPACE</span>
      </div>

      <section className="stats-grid">
        <article className="stat-card">
          <span className="stat-icon lavender">▤</span>
          <span className="stat-label">LIBRARY DOCUMENTS</span>
          <strong>{uploadedDocuments.length.toString().padStart(2, "0")}</strong>
          <p>Files connected to your assistant</p>
        </article>
        <article className="stat-card">
          <span className="stat-icon peach">⌘</span>
          <span className="stat-label">INDEXED CHUNKS</span>
          <strong>{documentCount.toString().padStart(2, "0")}</strong>
          <p>Searchable knowledge sections</p>
        </article>
        <article className="stat-card">
          <span className="stat-icon mint">✦</span>
          <span className="stat-label">AI ENGINE</span>
          <strong className="engine-name">Qwen 2.5</strong>
          <p>Running locally with Ollama</p>
        </article>
      </section>

      <section className="dashboard-bottom">
        <article className="dashboard-cta">
          <span className="eyebrow">MEET YOUR AI ASSISTANT</span>
          <h3>Good questions lead<br />to great discoveries.</h3>
          <p>Search your knowledge base and get answers grounded in your documents.</p>
          <button className="button-light" onClick={() => setActivePage("AI Assistant")}>
            Start a conversation ↗
          </button>
          <div className="cta-decoration">✳</div>
        </article>

        <article className="recent-card">
          <div className="card-heading">
            <div><span className="eyebrow">YOUR LIBRARY</span><h3>Recently added</h3></div>
            <button className="text-button" onClick={() => setActivePage("Library")}>View all ↗</button>
          </div>
          {uploadedDocuments.slice(0, 4).map((doc) => (
            <div className="recent-document" key={doc.filename}>
              <span className="pdf-icon">{(doc.filename.split(".").pop() || "FILE").slice(0, 4).toUpperCase()}</span>
              <div><strong>{doc.filename}</strong><small>{doc.chunks ?? 0} chunks</small></div>
            </div>
          ))}
          {!uploadedDocuments.length && (
            <p className="empty-copy">Your documents will appear here after upload.</p>
          )}
        </article>
      </section>
      <div className="system-line">
        <i className={status === "Backend Connected" ? "online" : "offline"} />
        {status}<span>·</span> FastAPI · ChromaDB · LangGraph
      </div>
    </div>
  );

  const renderLibrary = () => {
    const visibleDocuments = folder === "All documents"
      ? uploadedDocuments
      : uploadedDocuments.filter((doc) => doc.filename.toLowerCase().endsWith(".pdf"));

    return (
      <div className="library-layout">
        <aside className="library-folders">
          <div className="folder-heading">
            <span className="eyebrow">YOUR WORKSPACE</span>
            <strong>Folders</strong>
          </div>
          <button
            className={`folder-link ${folder === "All documents" ? "selected" : ""}`}
            onClick={() => setFolder("All documents")}
          >
            <span>▤</span> All documents <small>{uploadedDocuments.length}</small>
          </button>
          <button
            className={`folder-link ${folder === "PDF documents" ? "selected" : ""}`}
            onClick={() => setFolder("PDF documents")}
          >
            <span>▧</span> PDF documents
          </button>
          <div className="folder-tip">
            <span>✳</span>
            <strong>Your knowledge, organised.</strong>
            <p>Upload supported files to make their contents searchable by your AI assistant.</p>
          </div>
        </aside>

        <section className="library-content">
          <div className="library-header">
            <div>
              <span className="eyebrow">KNOWLEDGE COLLECTION</span>
              <h2>{folder}</h2>
              <p>Manage the documents connected to KnowFlow AI.</p>
            </div>
            <span className="file-count">{visibleDocuments.length} FILES</span>
          </div>

          <div className="upload-panel">
            <div className="upload-symbol">↑</div>
            <div className="upload-copy">
              <strong>Add to your knowledge library</strong>
              <p>Choose a supported document or image to extract, process and index its content.</p>
              {selectedFile && <small className="selected-file">{selectedFile.name}</small>}
            </div>
            <label className="button-secondary file-label" htmlFor="pdf-upload">Choose file</label>
            <input
              id="pdf-upload"
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.pptx,.jpg,.jpeg,.png,.html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,text/html"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            <button className="button-primary upload-submit" onClick={uploadDocument} disabled={uploading || !selectedFile}>
              {uploading ? "Indexing…" : "Upload and index"}
            </button>
            {uploadMessage && <p className="feedback upload-feedback">{uploadMessage}</p>}
          </div>

          <div className="library-subheading">
            <div><span className="eyebrow">YOUR COLLECTION</span><h3>Documents</h3></div>
            <button className="button-secondary" onClick={() => { fetchDocumentCount(); fetchUploadedDocuments(); }}>↻ Refresh</button>
          </div>

          <div className="document-grid">
            {visibleDocuments.map((doc, index) => (
              <article className="document-card" key={doc.filename}>
                <div className={`pdf-preview preview-${index % 4}`}>
                  <div className="preview-top"><span>{(doc.filename.split(".").pop() || "FILE").toUpperCase()} DOCUMENT</span><span>↗</span></div>
                  <div className="preview-page">
                    <div className="preview-mark">{(doc.filename.split(".").pop() || "FILE").slice(0, 4).toUpperCase()}</div>
                    <i /><i /><i /><i className="short-line" />
                    <div className="preview-block"></div>
                    <i /><i className="short-line" />
                  </div>
                </div>
                <div className="document-info">
                  <div className="document-title-row">
                    <span className="pdf-mini">{(doc.filename.split(".").pop() || "FILE").slice(0, 4).toUpperCase()}</span>
                    <h4 title={doc.filename}>{doc.filename}</h4>
                    <details className="document-menu">
                      <summary aria-label="Document actions">•••</summary>
                      <div className="menu-popover">
                        <button onClick={() => { setSelectedFilename(doc.filename); setActivePage("AI Assistant"); }}>
                          Ask AI about this
                        </button>
                        <button className="danger-text" disabled={deleting === doc.filename} onClick={() => removeDocument(doc.filename)}>
                          {deleting === doc.filename ? "Removing…" : "Remove document"}
                        </button>
                      </div>
                    </details>
                  </div>
                  <div className="document-meta"><span><i /> Indexed</span><span>{doc.chunks ?? 0} chunks</span></div>
                  <button className="document-open" onClick={() => { setSelectedFilename(doc.filename); setActivePage("AI Assistant"); }}>
                    Ask AI about this file <span>↗</span>
                  </button>
                </div>
              </article>
            ))}
            <label className="add-document-card" htmlFor="pdf-upload">
              <span className="add-document-icon">+</span>
              <strong>Add a document</strong>
              <small>PDF · Up to 15 MB</small>
            </label>
          </div>

          {!visibleDocuments.length && (
            <div className="empty-library">
              <span className="empty-icon">▤</span>
              <strong>Your library is waiting</strong>
              <p>Upload your first PDF to start building your knowledge base.</p>
            </div>
          )}
        </section>
      </div>
    );
  };

  const renderChat = () => (
    <div className="assistant-page assistant-page-full">
      <section className="assistant-panel assistant-panel-full">
        <div className="assistant-topline">
          <span className="eyebrow">KNOWFLOW INTELLIGENCE</span>
          <span className="local-badge"><i /> LOCAL AI ONLINE</span>
        </div>

        <div className="orb-stage" aria-hidden="true">
          <div className="orb-halo halo-one"></div>
          <div className="orb-halo halo-two"></div>
          <div className="orb-ring ring-one"></div>
          <div className="orb-ring ring-two"></div>
          <div className="ai-orb">
            <div className="orb-shine"></div>
            <div className="orb-core">✦</div>
          </div>
          <span className="orb-spark spark-one">✧</span>
          <span className="orb-spark spark-two">·</span>
          <span className="orb-spark spark-three">✦</span>
        </div>

        <div className="assistant-intro">
          <span className="eyebrow">YOUR KNOWLEDGE COMPANION</span>
          <h2>Ideas into answers.</h2>
          <p>Ask anything about your documents. Let's find the answer together.</p>
        </div>

        <div className="chat-messages">
          {!messages.length && (
            <div className="chat-welcome">
              <span>✦</span>
              <strong>Your conversation starts here.</strong>
              <p>Try asking a question about your uploaded documents.</p>
              <button onClick={() => setQuestion("Summarise the key points in my uploaded documents.")}>
                Summarise my documents <span>↗</span>
              </button>
            </div>
          )}

          {messages.map((message, index) => (
            <div className={`message-row ${message.role}`} key={index}>
              {message.role === "assistant" && <div className="message-avatar">✦</div>}
              <div className="message-bubble">
                <span className="message-author">{message.role === "user" ? "You" : "KnowFlow AI"}</span>
                <p>{message.content}</p>
              </div>
              {message.role === "user" && <div className="message-avatar user-avatar">Y</div>}
            </div>
          ))}

          {chatLoading && (
            <div className="message-row assistant">
              <div className="message-avatar">✦</div>
              <div className="message-bubble">
                <span className="message-author">KnowFlow AI</span>
                <div className="typing-indicator"><i /><i /><i /></div>
              </div>
            </div>
          )}
        </div>

        <form className="chat-composer" onSubmit={askQuestion}>
        <div className="assistant-document-trigger">
          <button
            type="button"
            className={`document-picker-button ${showDocumentPicker ? "active" : ""}`}
            onClick={() => setShowDocumentPicker((open) => !open)}
            aria-label="Choose documents to search"
            aria-expanded={showDocumentPicker}
            aria-haspopup="true"
            title="Choose knowledge sources"
            disabled={chatLoading}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M8 13h8M8 17h8" />
            </svg>
          </button>

          {showDocumentPicker && (
            <div className="document-picker-dropdown" role="menu">
              <div className="document-picker-heading">Search knowledge</div>

              <button
                type="button"
                role="menuitem"
                className={`document-picker-option ${selectedFilename === "" ? "active" : ""}`}
                onClick={() => {
                  setSelectedFilename("");
                  setShowDocumentPicker(false);
                }}
                disabled={chatLoading}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M3 7h18M5 7v13h14V7M9 7V4h6v3" />
                </svg>
                <span className="document-name">All documents</span>
                {selectedFilename === "" && <span aria-hidden="true">✓</span>}
              </button>

              {uploadedDocuments.map((doc) => (
                <button
                  type="button"
                  role="menuitem"
                  key={doc.filename}
                  className={`document-picker-option ${selectedFilename === doc.filename ? "active" : ""}`}
                  onClick={() => {
                    setSelectedFilename(doc.filename);
                    setShowDocumentPicker(false);
                  }}
                  disabled={chatLoading}
                  title={doc.filename}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  <span className="document-name">{doc.filename}</span>
                  {selectedFilename === doc.filename && <span aria-hidden="true">✓</span>}
                </button>
              ))}

              {!uploadedDocuments.length && (
                <div className="document-picker-empty">
                  No documents uploaded yet.
                </div>
              )}
            </div>
          )}
        </div>

          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask KnowFlow anything…"
            disabled={chatLoading}
          />
          <button type="submit" disabled={chatLoading || !question.trim()} aria-label="Send message">↑</button>
        </form>
        <p className="assistant-disclaimer">KnowFlow AI can make mistakes. Verify important information.</p>
      </section>
    </div>
  );

  const renderApprovals = () => (
    <div className="approval-page">
      <section className="approval-banner">
        <div>
          <span className="eyebrow">HUMAN-IN-THE-LOOP</span>
          <h2>Approval Center</h2>
          <p>
            {role === "manager"
              ? "Review incoming requests and record your decisions."
              : "Keep track of requests submitted from your AI conversations."}
          </p>
        </div>
        <span className={`role-badge ${role}`}>{role === "manager" ? "MANAGER VIEW" : "EMPLOYEE VIEW"}</span>
      </section>

      <section className="approval-stats">
        <article><span>TOTAL REQUESTS</span><strong>{approvalRequests.length}</strong></article>
        <article><span>PENDING</span><strong>{approvalRequests.filter((r) => r.status === "pending").length}</strong></article>
        <article><span>APPROVED</span><strong>{approvalRequests.filter((r) => r.status === "approved").length}</strong></article>
        <article><span>REJECTED</span><strong>{approvalRequests.filter((r) => r.status === "rejected").length}</strong></article>
      </section>

      {role === "employee" && (
        <section className="employee-request-panel">
          <div className="employee-request-heading">
            <div>
              <span className="eyebrow">MANUAL SUBMISSION</span>
              <h3>Request manager approval</h3>
              <p>Describe the action, access or change you need approved. Your request will appear in the manager's Approval Center.</p>
            </div>
            <span className="employee-request-symbol">↗</span>
          </div>
          <form className="employee-request-form" onSubmit={submitManualApprovalRequest}>
            <label htmlFor="manual-approval-request">Your request</label>
            <textarea
              id="manual-approval-request"
              rows={4}
              maxLength={2000}
              value={manualApprovalRequest}
              onChange={(event) => setManualApprovalRequest(event.target.value)}
              placeholder="Explain what you need approval for and why it is required..."
            />
            <div className="employee-request-footer">
              <span>{manualApprovalRequest.length}/2000 characters</span>
              <button
                className="button-primary"
                type="submit"
                disabled={manualApprovalSubmitting || !manualApprovalRequest.trim()}
              >
                {manualApprovalSubmitting ? "Submitting…" : "Submit for approval ↗"}
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="approval-list-heading">
        <div><span className="eyebrow">{role === "manager" ? "TEAM QUEUE" : "YOUR ACTIVITY"}</span><h3>{role === "manager" ? "Requests for review" : "Your submitted requests"}</h3></div>
        <button className="button-secondary" onClick={fetchApprovals}>↻ Refresh</button>
      </div>

      {approvalMessage && <p className="feedback">{approvalMessage}</p>}

      <div className="approval-list">
        {approvalRequests.map((request) => (
          <article className="approval-card" key={request.id}>
            <div className="approval-card-heading">
              <span className="approval-symbol">↗</span>
              <span className={`status-pill ${request.status}`}>{request.status}</span>
            </div>
            <h3>{request.proposed_action || request.request}</h3>
            <p>{request.request}</p>
            <div className="approval-meta">
              <span>Submitted {request.created_at ? new Date(request.created_at).toLocaleString() : "—"}</span>
              <span>Request #{String(request.id).slice(0, 8)}</span>
            </div>
            {role === "manager" && request.status === "pending" && (
              <div className="approval-actions">
                <button className="approve-button" disabled={approvalLoading} onClick={() => decideApproval(request.id, "approved")}>
                  ✓ Approve
                </button>
                <button className="reject-button" disabled={approvalLoading} onClick={() => decideApproval(request.id, "rejected")}>
                  Decline
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      {!approvalRequests.length && (
        <div className="empty-library">
          <span className="empty-icon">✓</span>
          <strong>No requests yet</strong>
          <p>{role === "manager" ? "New employee requests will appear here." : "Requests you submit manually or through AI Assistant will appear here."}</p>
        </div>
      )}
      <p className="approval-footnote">Requests are reviewed by a human before a decision is recorded.</p>
    </div>
  );

  const pageContent = {
    Dashboard: renderDashboard,
    Library: renderLibrary,
    "AI Assistant": renderChat,
    Approvals: renderApprovals,
  };

  if (sessionLoading) {
    return <div className="session-loading">Restoring your KnowFlow session…</div>;
  }

  return (
    <div className={`app-shell ${role === "manager" ? "manager-mode" : "employee-mode"}`}>
      <aside className="sidebar">
        <button className="brand" onClick={() => setActivePage("Dashboard")}>
          <span className="brand-mark">K</span>
          <span className="brand-copy"><strong>KnowFlow<span> AI</span></strong><small>KNOWLEDGE INTELLIGENCE</small></span>
        </button>

        <div className="nav-caption">WORKSPACE</div>
        <nav className="side-nav">
          {navItems.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${activePage === item.name ? "active" : ""}`}
              onClick={() => setActivePage(item.name)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.name}</span>
              {activePage === item.name && <i className="nav-indicator" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="role-switcher">
            <span className="eyebrow">CURRENT ROLE</span>
            <strong>{role === "manager" ? "Manager" : "Employee"}</strong>
            <button onClick={switchRole}>
              {role === "manager" ? "Switch to Employee" : "Switch to Manager"} ↗
            </button>
          </div>
          <div className="sidebar-status">
            <i className={status === "Backend Connected" ? "online" : "offline"} />
            <div><strong>{status}</strong><small>Local environment</small></div>
          </div>
          <div className="sidebar-version">KNOWFLOW AI <span>v1.0.0</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title">
            <div className="breadcrumb">Workspace <span>/</span> {activePage}</div>
            <h1>{activePage}</h1>
            <p>{pageDescriptions[activePage]}</p>
          </div>
          <div className="topbar-actions">
            <div className="connection-badge">
              <i className={status === "Backend Connected" ? "online" : "offline"} />
              {status}
            </div>
            <button className="theme-toggle" onClick={toggleTheme} aria-label="Toggle colour theme" title="Toggle theme">
              {theme === "light" ? "☾" : "☀"}
              <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
            </button>
            <div className="profile-mark">{role === "manager" ? "MG" : "EM"}</div>
          </div>
        </header>

        <div className="page-content">{pageContent[activePage]()}</div>
        <footer className="app-footer">
          <span>KnowFlow AI</span>
          <span>Enterprise Knowledge Assistant · Agentic RAG</span>
        </footer>
      </main>
      {/* Manager login modal */}
{showManagerLogin && (
  <div
    className="modal-backdrop"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        setShowManagerLogin(false);
        setManagerPassword("");
        setManagerLoginError("");
      }
    }}
  >
    <form className="app-modal" onSubmit={submitManagerLogin}>
      <div className="modal-icon">♙</div>
      <span className="eyebrow">SECURE ACCESS</span>
      <h2>Manager sign in</h2>
      <p>Enter the manager password to access the Approval Center.</p>

      <label htmlFor="manager-password">Manager password</label>
      <input
        id="manager-password"
        type="password"
        autoFocus
        value={managerPassword}
        onChange={(event) => setManagerPassword(event.target.value)}
        placeholder="Enter your password"
      />

      {managerLoginError && (
        <p className="modal-error">{managerLoginError}</p>
      )}

      <div className="modal-actions">
        <button
          type="button"
          className="modal-cancel"
          onClick={() => {
            setShowManagerLogin(false);
            setManagerPassword("");
            setManagerLoginError("");
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="modal-confirm"
          disabled={managerLoginLoading || !managerPassword.trim()}
        >
          {managerLoginLoading ? "Verifying…" : "Continue"}
        </button>
      </div>
    </form>
  </div>
)}

{/* Document removal confirmation */}
{documentToRemove && (
  <div
    className="modal-backdrop"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget && !deleting) {
        setDocumentToRemove("");
      }
    }}
  >
    <div className="app-modal">
      <div className="modal-icon danger-icon">!</div>
      <span className="eyebrow">LIBRARY MANAGEMENT</span>
      <h2>Remove this document?</h2>
      <p>
        Are you sure you want to remove
        <strong className="modal-filename"> {documentToRemove}</strong>
        {" "}from your Library? This action cannot be undone.
      </p>

      <div className="modal-actions">
        <button
          type="button"
          className="modal-cancel"
          disabled={!!deleting}
          onClick={() => setDocumentToRemove("")}
        >
          Keep document
        </button>
        <button
          type="button"
          className="modal-danger"
          disabled={!!deleting}
          onClick={confirmRemoveDocument}
        >
          {deleting ? "Removing…" : "Remove document"}
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}

export default App;