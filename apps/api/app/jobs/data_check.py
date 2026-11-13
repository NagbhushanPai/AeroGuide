"""Weekly data check (ADR-0013). Reports; never edits data.

    python -m app.jobs.data_check --previous previous-issue.md --output report.md

Checks:
  1. Seed validation: the YAML content passes every schema and provenance rule.
  2. Review queue: curated records that are outdated, unverified or unavailable.
  3. Source links: every source URL answers, where it redirects, and whether its main text
     changed since last week. Last week's hashes are read back from the previous report.
  4. Open data providers: one small request each, checking the response shape.

Exit code 1 only when seed validation fails (the report is still written).
"""

import argparse
import asyncio
import hashlib
import html
import json
import os
import re
import sys
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx

from app import __version__
from app.core.india import today_ist
from app.seed.bundle import DATA_DIR, Bundle, DueItem, SeedError, due_for_review, read_bundle

USER_AGENT = f"AeroGuide-DataCheck/{__version__} (+https://github.com/NagbhushanPai/AeroGuide)"
REQUEST_SPACING_S = 1.0
STATE_MARKER = "data-check-state"
STATE_RE = re.compile(rf"<!--\s*{STATE_MARKER}:\s*(\{{.*?\}})\s*-->", re.S)
ROBOTS_DISALLOWED = "disallowed by robots.txt"
MAX_LISTED = 50  # keep the issue readable (and under GitHub's 65,536-character body limit)


# ---------------------------------------------------------------- source links


@dataclass(frozen=True)
class LinkResult:
    key: str
    url: str
    status: int | None
    final_url: str | None
    content_hash: str | None
    changed: bool | None  # None: no previous hash to compare with
    error: str | None = None


_DROP_BLOCKS = re.compile(r"<(script|style|noscript|svg|template)\b.*?</\1\s*>", re.S | re.I)
_TAGS = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")


def main_text(page: str) -> str:
    """Visible text with markup, scripts and whitespace differences removed, so cosmetic
    changes (CSS, tracking scripts, attribute order) don't count as content changes."""
    text = _DROP_BLOCKS.sub(" ", page)
    text = _TAGS.sub(" ", text)
    return _SPACE.sub(" ", html.unescape(text)).strip()


def content_hash(page: str) -> str:
    return hashlib.sha256(main_text(page).encode("utf-8")).hexdigest()[:16]


def parse_previous_state(previous_report: str) -> dict[str, str]:
    """Source key -> content hash, from the hidden comment in last week's report."""
    match = STATE_RE.search(previous_report)
    if not match:
        return {}
    try:
        state = json.loads(match.group(1))
    except json.JSONDecodeError:
        return {}
    hashes = state.get("hashes", {})
    return {str(k): str(v) for k, v in hashes.items()} if isinstance(hashes, dict) else {}


async def _allowed_by_robots(client: httpx.AsyncClient, url: str, cache: dict[str, Any]) -> bool:
    parts = urlsplit(url)
    origin = f"{parts.scheme}://{parts.netloc}"
    if origin not in cache:
        parser = RobotFileParser()
        try:
            r = await client.get(f"{origin}/robots.txt")
            parser.parse(r.text.splitlines() if r.status_code == 200 else [])
        except httpx.HTTPError:
            parser.parse([])  # no robots.txt reachable: nothing is disallowed
        cache[origin] = parser
    allowed: bool = cache[origin].can_fetch(USER_AGENT, url)
    return allowed


async def check_links(
    client: httpx.AsyncClient,
    sources: list[tuple[str, str]],
    previous: dict[str, str],
    spacing_s: float = REQUEST_SPACING_S,
) -> list[LinkResult]:
    results: list[LinkResult] = []
    robots: dict[str, Any] = {}
    for i, (key, url) in enumerate(sources):
        if i and spacing_s:
            await asyncio.sleep(spacing_s)
        try:
            if not await _allowed_by_robots(client, url, robots):
                results.append(LinkResult(key, url, None, None, None, None, ROBOTS_DISALLOWED))
                continue
            r = await client.get(url)
        except httpx.HTTPError as exc:
            results.append(
                LinkResult(key, url, None, None, None, None, f"{type(exc).__name__}: {exc}".strip())
            )
            continue
        digest = content_hash(r.text) if r.status_code < 400 else None
        before = previous.get(key)
        changed = None if digest is None or before is None else digest != before
        results.append(LinkResult(key, url, r.status_code, str(r.url), digest, changed))
    return results


# ---------------------------------------------------------------- open data providers


@dataclass(frozen=True)
class ProviderResult:
    name: str
    ok: bool
    detail: str


Check = Callable[[httpx.Response], str]


def _readsb(r: httpx.Response) -> str:
    body = r.json()
    if not isinstance(body.get("ac"), list):
        raise ValueError("no 'ac' list in response")
    return f"{len(body['ac'])} aircraft near Delhi"


def _opensky(r: httpx.Response) -> str:
    body = r.json()
    if "time" not in body or "states" not in body:
        raise ValueError("missing 'time' or 'states'")
    return f"{len(body['states'] or [])} state vectors near Delhi"


def _adsbdb(r: httpx.Response) -> str:
    body = r.json()
    if "response" not in body:
        raise ValueError("missing 'response'")
    return "responded with the expected shape"


PROVIDER_CHECKS: list[tuple[str, str, Check]] = [
    ("adsb.lol", "https://api.adsb.lol/v2/point/28.56/77.1/25", _readsb),
    ("adsb.fi", "https://opendata.adsb.fi/api/v3/lat/28.56/lon/77.1/dist/25", _readsb),
    (
        "OpenSky Network",
        "https://opensky-network.org/api/states/all?lamin=28.3&lomin=76.8&lamax=28.8&lomax=77.4",
        _opensky,
    ),
    ("adsbdb", "https://api.adsbdb.com/v0/callsign/AIC101", _adsbdb),
]


async def check_providers(
    client: httpx.AsyncClient,
    checks: list[tuple[str, str, Check]] = PROVIDER_CHECKS,
    spacing_s: float = REQUEST_SPACING_S,
) -> list[ProviderResult]:
    results: list[ProviderResult] = []
    for i, (name, url, check) in enumerate(checks):
        if i and spacing_s:
            await asyncio.sleep(spacing_s)
        try:
            r = await client.get(url)
            if r.status_code == 429:
                results.append(
                    ProviderResult(name, False, "rate limited (429) from GitHub's runner")
                )
                continue
            r.raise_for_status()
            results.append(ProviderResult(name, True, check(r)))
        except (httpx.HTTPError, ValueError, AttributeError) as exc:
            results.append(ProviderResult(name, False, f"{type(exc).__name__}: {exc}".strip()))
    return results


# ---------------------------------------------------------------- report


@dataclass
class Report:
    today: date
    seed_errors: list[str]
    due: list[DueItem]
    unverified_geodata: int
    guides: int
    links: list[LinkResult]
    providers: list[ProviderResult]

    @property
    def state(self) -> dict[str, Any]:
        hashes = {link.key: link.content_hash for link in self.links if link.content_hash}
        return {"date": self.today.isoformat(), "hashes": hashes}


def _items(lines: list[str], limit: int = MAX_LISTED) -> list[str]:
    if len(lines) <= limit:
        return lines
    return [*lines[:limit], f"- …and {len(lines) - limit} more"]


def render(report: Report) -> str:
    out: list[str] = [
        f"# Weekly data check — {report.today.isoformat()}",
        "",
        "Automated report ([ADR-0013](../blob/main/docs/decisions/0013-weekly-data-check.md)). "
        "It never changes data: a person re-checks each source and updates the YAML in a PR.",
        "",
    ]

    skipped = [lk for lk in report.links if lk.error == ROBOTS_DISALLOWED]
    broken = [
        lk for lk in report.links if lk not in skipped and (lk.error or (lk.status or 0) >= 400)
    ]
    changed = [lk for lk in report.links if lk.changed]
    moved = [
        lk
        for lk in report.links
        if lk.final_url and lk.final_url.rstrip("/") != lk.url.rstrip("/") and lk not in broken
    ]
    failing = [p for p in report.providers if not p.ok]
    seed = f"❌ {len(report.seed_errors)} problem(s)" if report.seed_errors else "✅ passed"
    links = (
        f"{len(report.links)} checked · {len(broken)} broken · {len(changed)} changed · "
        f"{len(moved)} redirected · {len(skipped)} to check by hand"
    )
    ok = len(report.providers) - len(failing)
    out += [
        "## Summary",
        "",
        "| Check | Result |",
        "|---|---|",
        f"| Seed validation | {seed} |",
        f"| Curated records to review | {len(report.due)} |",
        f"| Sources | {links} |",
        f"| Open data providers | {ok} of {len(report.providers)} OK |",
        "",
    ]

    if report.seed_errors:
        out += [
            "## Seed validation problems",
            "",
            *_items([f"- {e}" for e in report.seed_errors]),
            "",
        ]

    out += ["## Records to review", ""]
    if report.due:
        out += _items(
            [
                f"- [ ] {d.where}: **{d.status}**"
                + (f" (was due {d.due.isoformat()})" if d.due else "")
                for d in report.due
            ]
        )
    else:
        out.append("No curated terminal or airline records are due.")
    out += [
        "",
        f"Airport geodata: {report.unverified_geodata} airports are still *unverified* "
        "(OurAirports, not yet cross-checked against AIP India). "
        f"{report.guides} airports have guide files.",
        "",
        "## Sources",
        "",
    ]
    if broken or changed or moved or skipped:
        for lk in broken:
            out.append(f"- [ ] ❌ `{lk.key}` {lk.url}: {lk.error or f'HTTP {lk.status}'}")
        for lk in changed:
            out.append(f"- [ ] ✏️ `{lk.key}` {lk.url}: main text changed since the last check")
        for lk in moved:
            out.append(f"- [ ] ↪️ `{lk.key}` {lk.url} now redirects to {lk.final_url}")
        for lk in skipped:
            out.append(
                f"- [ ] 👀 `{lk.key}` {lk.url}: the site's robots.txt asks automated tools not "
                "to fetch it, so open it in a browser to check it"
            )
    else:
        out.append("All sources answered, with no changes or redirects.")
    first = not any(lk.changed is not None for lk in report.links)
    if first and report.links:
        out += [
            "",
            "_No previous hashes were found, so content changes are tracked from this run on._",
        ]

    out += ["", "## Open data providers", "", "| Provider | Status | Detail |", "|---|---|---|"]
    for p in report.providers:
        out.append(f"| {p.name} | {'✅' if p.ok else '⚠️'} | {p.detail.replace('|', '/')} |")
    out += [
        "",
        "_Providers can throttle GitHub's shared runners, so one warning isn't an outage. "
        "Two weeks in a row is worth a look._",
        "",
        f"<!-- {STATE_MARKER}: {json.dumps(report.state, separators=(',', ':'))} -->",
        "",
    ]
    return "\n".join(out)


# ---------------------------------------------------------------- entry point


async def run(
    data_dir: Path,
    previous_report: str,
    client: httpx.AsyncClient,
    today: date,
    spacing_s: float = REQUEST_SPACING_S,
    provider_checks: list[tuple[str, str, Check]] = PROVIDER_CHECKS,
) -> Report:
    seed_errors: list[str] = []
    try:
        bundle: Bundle | None = read_bundle(data_dir)
    except SeedError as exc:
        seed_errors, bundle = exc.errors, None

    due: list[DueItem] = []
    unverified = guides = 0
    sources: list[tuple[str, str]] = []
    if bundle is not None:
        due = due_for_review(bundle, today)
        # Geodata is always seeded unverified: its source is secondary (ADR-0006).
        unverified = len(bundle.airports.airports)
        guides = len(bundle.guides)
        sources = [(s.key, str(s.url)) for s in bundle.sources]

    previous = parse_previous_state(previous_report)
    links = await check_links(client, sources, previous, spacing_s)
    providers = await check_providers(client, provider_checks, spacing_s)
    return Report(today, seed_errors, due, unverified, guides, links, providers)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.jobs.data_check")
    parser.add_argument("--previous", type=Path, help="last week's report (issue body)")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    args = parser.parse_args(argv)

    previous = ""
    if args.previous and args.previous.exists():
        previous = args.previous.read_text(encoding="utf-8")

    async def go() -> Report:
        async with httpx.AsyncClient(
            timeout=20.0, follow_redirects=True, headers={"User-Agent": USER_AGENT}
        ) as client:
            return await run(args.data_dir, previous, client, today_ist())

    report = asyncio.run(go())
    text = render(report)
    args.output.write_text(text, encoding="utf-8")
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as f:
            f.write(text)
    print(
        json.dumps(
            {
                "seed_errors": len(report.seed_errors),
                "due": len(report.due),
                "links": [asdict(lk) for lk in report.links],
            },
            indent=1,
            default=str,
        )
    )
    return 1 if report.seed_errors else 0


if __name__ == "__main__":
    sys.exit(main())
