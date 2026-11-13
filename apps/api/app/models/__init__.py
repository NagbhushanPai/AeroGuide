"""ORM models. Import every model module here so Alembic autogenerate sees it."""

from app.database.base import Base

__all__ = ["Base"]
