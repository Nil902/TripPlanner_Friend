"""
Database engine and session dependency using SQLModel and SQLite.
"""

import logging
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.core.config import settings

logger = logging.getLogger(__name__)


# SQLite connection args for multi-threaded FastAPI dev server
connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
pool_kwargs = (
    {}
    if "sqlite" in settings.DATABASE_URL
    else {"pool_size": 20, "max_overflow": 20, "pool_recycle": 3600}
)

engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args=connect_args,
    pool_pre_ping=True,
    **pool_kwargs,
)


def init_db() -> None:
    """Initialize database tables from SQLModel metadata and seed default admin."""
    # Import all models to ensure they are registered with SQLModel.metadata
    from app.models.schema import (  # noqa: F401
        Constraint,
        Expense,
        Place,
        Plan,
        PlanItem,
        Trip,
        User,
    )

    SQLModel.metadata.create_all(engine)

    # SQLite migration safeguard for is_admin column if users table was created previously
    if "sqlite" in settings.DATABASE_URL:
        with engine.connect() as conn:
            cursor = conn.exec_driver_sql("PRAGMA table_info(users)")
            cols = [row[1] for row in cursor.fetchall()]
            if "is_admin" not in cols:
                conn.exec_driver_sql(
                    "ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0"
                )
                conn.commit()

    # Seed default platform admin account from env vars only.
    # ADMIN_EMAIL and ADMIN_PASSWORD must both be explicitly set.
    # If neither is provided, no default admin is created — preventing
    # well-known credentials from existing on unattended deployments.
    admin_email = settings.ADMIN_EMAIL.strip() if settings.ADMIN_EMAIL else ""
    admin_password = settings.ADMIN_PASSWORD.strip() if settings.ADMIN_PASSWORD else ""

    if admin_email and admin_password:
        from sqlmodel import select

        from app.core.security import hash_password

        with Session(engine) as session:
            admin_user = session.exec(
                select(User).where(User.email == admin_email.lower())
            ).first()
            if not admin_user:
                admin_user = User(
                    email=admin_email.lower(),
                    name="Platform Administrator",
                    hashed_password=hash_password(admin_password),
                    is_admin=True,
                )
                session.add(admin_user)
                session.commit()
                logger.info("Default admin account created: %s", admin_email)
    else:
        logger.warning(
            "ADMIN_EMAIL and ADMIN_PASSWORD are not set. "
            "No default admin account will be seeded. "
            "Set both in .env to enable the admin panel."
        )


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency for obtaining a database session per request."""
    with Session(engine) as session:
        yield session
