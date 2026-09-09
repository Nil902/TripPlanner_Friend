"""
Authentication API endpoints: Signup, Login, and Profile inspection.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.db import get_session
from app.core.security import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from app.models.schema import (
    AuthResponse,
    LoginRequest,
    SignupRequest,
    User,
    UserResponse,
)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])


@router.post(
    "/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED
)
def signup(
    req: SignupRequest,
    session: Session = Depends(get_session),
):
    """Register a new user account with email and password."""
    # Validate minimum password length before doing any DB work
    if len(req.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "WEAK_PASSWORD",
                "message": "Password must be at least 8 characters long.",
            },
        )

    # Check if user already exists
    existing = session.exec(
        select(User).where(User.email == req.email.lower().strip())
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "EMAIL_EXISTS",
                "message": "An account with this email already exists.",
            },
        )

    user = User(
        email=req.email.lower().strip(),
        name=req.name.strip(),
        hashed_password=hash_password(req.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_access_token(user.id)
    return AuthResponse(
        token=token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=AuthResponse)
def login(
    req: LoginRequest,
    session: Session = Depends(get_session),
):
    """Authenticate user credentials and return bearer token."""
    user = session.exec(
        select(User).where(User.email == req.email.lower().strip())
    ).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_CREDENTIALS",
                "message": "Invalid email or password.",
            },
        )

    token = create_access_token(user.id)
    return AuthResponse(
        token=token,
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: User = Depends(get_current_user),
):
    """Retrieve currently authenticated user profile."""
    return UserResponse.model_validate(current_user)
