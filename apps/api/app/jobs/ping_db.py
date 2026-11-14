"""Run one trivial query, so a free-tier database that pauses after a week without activity
stays awake (Supabase free projects pause after 7 days). Used by .github/workflows/keep-alive.yml.

    uv run python -m app.jobs.ping_db
"""

import asyncio
import sys

from sqlalchemy import text

from app.core.config import get_settings
from app.database.session import create_engine


async def ping() -> int:
    engine = create_engine(str(get_settings().database_url))
    try:
        async with engine.connect() as conn:
            airports = (await conn.execute(text("SELECT count(*) FROM airports"))).scalar_one()
    finally:
        await engine.dispose()
    print(f"database awake: {airports} airports")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(ping()))
