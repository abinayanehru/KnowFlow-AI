import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from uuid import uuid4

DB_PATH = Path(__file__).resolve().parents[2] / "approval_requests.sqlite"

def get_connection():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection

def initialize_approval_db():
    with get_connection() as connection:
        connection.execute("""CREATE TABLE IF NOT EXISTS approval_requests (
            id TEXT PRIMARY KEY, requester_id TEXT NOT NULL, request TEXT NOT NULL,
            proposed_action TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
            reviewer_id TEXT, comment TEXT DEFAULT '', created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL)""")
        connection.commit()

def create_request(requester_id, request, proposed_action=None):
    request_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()
    action = proposed_action or request
    with get_connection() as connection:
        connection.execute("INSERT INTO approval_requests (id, requester_id, request, proposed_action, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)", (request_id, requester_id, request, action, now, now))
        connection.commit()
    return get_request(request_id)

def get_request(request_id):
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM approval_requests WHERE id=?", (request_id,)).fetchone()
    return dict(row) if row else None

def list_requests(requester_id=None, status=None):
    query, params, clauses = "SELECT * FROM approval_requests", [], []
    if requester_id is not None: clauses.append("requester_id=?"); params.append(requester_id)
    if status is not None: clauses.append("status=?"); params.append(status)
    if clauses: query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY created_at DESC"
    with get_connection() as connection:
        rows = connection.execute(query, params).fetchall()
    return [dict(row) for row in rows]

def decide_request(request_id, reviewer_id, decision, comment=""):
    if decision not in {"approved", "rejected"}: raise ValueError("Decision must be approved or rejected")
    now = datetime.now(timezone.utc).isoformat()
    with get_connection() as connection:
        cursor = connection.execute("UPDATE approval_requests SET status=?, reviewer_id=?, comment=?, updated_at=? WHERE id=? AND status='pending'", (decision, reviewer_id, comment, now, request_id))
        connection.commit()
        if cursor.rowcount != 1: return None
    return get_request(request_id)

initialize_approval_db()
