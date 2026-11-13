# ADR-0008: Defer AI integration; keep services tool-ready

- Status: Proposed
- Date: 2026-11-13

## Context
The brief explicitly excludes AI features from this phase but requires that AI can be added later without a rewrite.

## Decision
- No LLM SDKs, chat UI, RAG, embeddings or agents in this phase, and no AI dependencies in the lockfiles.
- Services in `app/services/` are framework-agnostic functions with **typed Pydantic inputs and outputs** and docstrings that describe intent. Examples: `search_airports(query) -> list[AirportSummary]`, `evaluate_eligibility(request) -> EligibilityResult`.
- Results carry provenance and `meta`, so a future assistant can cite sources and refuse to answer without them.
- Read-only services and deterministic engines (like eligibility) are what an AI layer would call. The AI layer would never compute eligibility itself.

## Consequences
A future phase can expose these services as controlled tools (for example via MCP or function calling) by adding a thin adapter, with no domain rewrite.
