"""Seed CLI.

python -m app.seed            validate the YAML, then write it to DATABASE_URL
python -m app.seed --check    validate only (no database), exit 1 on any problem
"""

import argparse
import asyncio
import sys
from pathlib import Path

from app.core.config import get_settings
from app.database.session import create_engine
from app.seed.bundle import DATA_DIR, SeedError, read_bundle
from app.seed.loader import apply_bundle


async def _write(data_dir: Path) -> None:
    bundle = read_bundle(data_dir)
    engine = create_engine(str(get_settings().database_url))
    try:
        async with engine.begin() as conn:
            summary = await apply_bundle(conn, bundle)
    finally:
        await engine.dispose()
    print(
        f"seeded {summary.sources} sources, {summary.airports} airports "
        f"({summary.guides} with guides), {summary.airlines} airlines, "
        f"{summary.terminals} terminals, {summary.terminal_airlines} terminal airlines, "
        f"{summary.osm_terminals} OpenStreetMap terminals, "
        f"{summary.lounges.lounges} lounges, {summary.lounges.programs} programmes, "
        f"{summary.lounges.banks} banks, {summary.lounges.cards} cards, "
        f"{summary.lounges.policies} policy versions"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.seed", description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate only, no database")
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    args = parser.parse_args(argv)
    try:
        if args.check:
            bundle = read_bundle(args.data_dir)
            print(
                f"seed files OK: {len(bundle.sources)} sources, "
                f"{len(bundle.airports.airports)} airports, {len(bundle.guides)} guides"
            )
        else:
            asyncio.run(_write(args.data_dir))
    except SeedError as exc:
        print(f"seed validation failed ({len(exc.errors)} problem(s)):", file=sys.stderr)
        for err in exc.errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
