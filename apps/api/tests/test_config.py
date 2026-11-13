import pytest

from app.core.config import Settings, normalise_database_url

ASYNC = "postgresql+asyncpg://u:p@db.example:5432/postgres"


@pytest.mark.parametrize(
    "given",
    [
        "postgresql://u:p@db.example:5432/postgres",
        "postgres://u:p@db.example:5432/postgres",
        "postgresql+psycopg://u:p@db.example:5432/postgres",
        "  postgresql+asyncpg://u:p@db.example:5432/postgres\n",
    ],
)
def test_database_url_uses_asyncpg(given: str) -> None:
    assert normalise_database_url(given) == ASYNC


def test_sslmode_becomes_asyncpg_ssl() -> None:
    url = normalise_database_url("postgresql://u:p@h/db?sslmode=require&application_name=x")
    assert url == "postgresql+asyncpg://u:p@h/db?ssl=require&application_name=x"


def test_settings_apply_the_normalisation() -> None:
    settings = Settings(database_url="postgresql://u:p@db.example:5432/postgres")
    assert str(settings.database_url).startswith("postgresql+asyncpg://")
