import base64, hashlib, hmac, json, os, time
from pathlib import Path
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-development-secret-before-deployment")
MANAGER_PASSWORD = os.getenv("MANAGER_PASSWORD", "")
MANAGER_PASSWORD_HASH = os.getenv("MANAGER_PASSWORD_HASH", "")
TOKEN_TTL_SECONDS = 8 * 60 * 60
bearer = HTTPBearer(auto_error=False)


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _sign(payload: dict) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    signature = hmac.new(SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest()
    return body + "." + _b64(signature)


def create_employee_token(user_id: str) -> str:
    now = int(time.time())
    return _sign({"sub": user_id, "role": "employee", "iat": now, "exp": now + TOKEN_TTL_SECONDS})


def create_manager_token() -> str:
    now = int(time.time())
    # Separate stable principal so the same browser can review its employee's request.
    return _sign({"sub": "knowflow-manager", "role": "manager", "iat": now, "exp": now + TOKEN_TTL_SECONDS})


def decode_token(token: str):
    try:
        body, supplied = token.split(".", 1)
        expected = hmac.new(SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _unb64(supplied)): return None
        payload = json.loads(_unb64(body))
        if int(payload.get("exp", 0)) <= int(time.time()): return None
        if payload.get("role") not in {"employee", "manager"} or not payload.get("sub"): return None
        return payload
    except Exception:
        return None


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)):
    if not credentials: raise HTTPException(status_code=401, detail="Authentication required.")
    user = decode_token(credentials.credentials)
    if not user: raise HTTPException(status_code=401, detail="Invalid or expired session. Please sign in again.")
    return user


def require_manager(user=Depends(get_current_user)):
    if user["role"] != "manager": raise HTTPException(status_code=403, detail="Manager access required.")
    return user


def require_employee(user=Depends(get_current_user)):
    if user["role"] != "employee": raise HTTPException(status_code=403, detail="Employee access required.")
    return user


def verify_manager_password(password: str) -> bool:
    if MANAGER_PASSWORD_HASH:
        # Support bcrypt hashes and SHA-256 hashes without changing existing .env values.
        if MANAGER_PASSWORD_HASH.startswith(("$2a$", "$2b$", "$2y$")):
            try:
                import bcrypt
                return bcrypt.checkpw(password.encode(), MANAGER_PASSWORD_HASH.encode())
            except Exception:
                return False
        if len(MANAGER_PASSWORD_HASH) == 64:
            digest = hashlib.sha256(password.encode()).hexdigest()
            return hmac.compare_digest(digest, MANAGER_PASSWORD_HASH)
        return hmac.compare_digest(password, MANAGER_PASSWORD_HASH)
    return bool(MANAGER_PASSWORD) and hmac.compare_digest(password, MANAGER_PASSWORD)
