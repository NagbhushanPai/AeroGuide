import os

import pytest

# Tests never use a real paid API: blank the Ignav key even if apps/api/.env has one
# (environment variables override the .env file), and use demo fares by default.
os.environ["IGNAV_API_KEY"] = ""
os.environ["FARE_PROVIDERS"] = "mock"


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--integration",
        action="store_true",
        default=False,
        help="run tests that need Postgres+PostGIS and Redis (docker compose up)",
    )


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if config.getoption("--integration"):
        return
    skip = pytest.mark.skip(reason="needs --integration and running services")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip)
