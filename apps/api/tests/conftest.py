import pytest


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
