import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.security.auth import get_current_user, require_employee, create_employee_token, create_manager_token, verify_manager_password

router = APIRouter(prefix="/auth", tags=["Authentication"])

class ManagerLogin(BaseModel):
    password: str

@router.post("/employee")
def start_employee_session():
    user_id = str(uuid.uuid4())
    token = create_employee_token(user_id)
    return {"access_token": token, "token_type": "bearer", "role": "employee", "user_id": user_id}

@router.get("/session")
def get_session(user=Depends(get_current_user)):
    return {"role": user["role"], "user_id": user["sub"]}

@router.post("/manager")
def manager_session(body: ManagerLogin, employee=Depends(require_employee)):
    if not verify_manager_password(body.password):
        raise HTTPException(status_code=401, detail="Incorrect manager password.")
    token = create_manager_token()
    return {"access_token": token, "token_type": "bearer", "role": "manager", "user_id": "knowflow-manager"}
