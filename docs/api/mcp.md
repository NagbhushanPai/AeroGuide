# MCP server: AeroGuide for AI assistants

AeroGuide runs a [Model Context Protocol](https://modelcontextprotocol.io/) server, so an AI assistant can look things up in AeroGuide and chain the results into multi-step travel answers. It's free to use, read-only, and needs no account. Background: [ADR-0014](../decisions/0014-mcp-server-for-ai-assistants.md).

- **Endpoint:** `https://aeroguide-erq3.onrender.com/mcp`
- **Transport:** Streamable HTTP (stateless, JSON responses)
- **Authentication:** none; every tool reads public data

The API runs on a free tier that sleeps when idle. The first call after a quiet spell can take up to a minute, and an assistant may report one timeout. Ask again and it works.

## Connect it to Claude (free plan works)

1. In Claude, open **Customize**, then **Connectors**.
2. Choose **Add custom connector**.
3. Name it AeroGuide and paste the endpoint URL above. Leave the authentication settings empty.
4. In a chat, turn the AeroGuide connector on and ask a question.

Claude's Free plan allows one custom connector ([Anthropic's guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)). Any other client that supports remote MCP servers over Streamable HTTP can connect the same way.

## Tools

All tools are read-only. Results carry each record's source and verification status, so the assistant can cite them.

| Tool | What it answers |
|---|---|
| `search_airports` | Find airports by code, name, city or state (typo-tolerant) |
| `get_airport` | One airport: location, official website, verified terminals, terminals mapped in OpenStreetMap |
| `airlines_seen` | Airlines whose aircraft were seen at the airport in recent days (community ADS-B data, not a timetable) |
| `list_lounges` | Lounges at an airport, or lounges accepting a programme |
| `get_lounge` | One lounge: terminal, location, hours, amenities, accepted programmes |
| `list_lounge_programmes` | Priority Pass, bank programmes, paid entry and the rest |
| `list_cards` | Credit cards with recorded lounge benefits |
| `get_card` | One card's benefit, every version with its rules and source |
| `check_lounge_access` | Which of your cards get you into each lounge: yes, no or depends, with the reasons |
| `flights_near_airport` | Aircraft near an airport right now, nearest first |
| `get_flight` | One aircraft's live position, reported route and progress |
| `search_flights` | Fares on Indian domestic flights, one way or round trip: the top 10 by best, cheapest or fastest, with filters, and a link to AeroGuide's fares page to compare all and book |

`check_lounge_access` runs the same deterministic engine as the website. You can add the visits you've used and your spend, keyed by card. Without them, a benefit with a spend condition answers "depends". Never share card numbers; the tool identifies card products only, and refuses fields it doesn't know.

`search_flights` uses a paid source within a request budget ([ADR-0015](../decisions/0015-paid-fare-search-with-a-request-budget.md)):

- **Daily cap for assistants:** live searches from all AI assistants together are capped at `FARES_MCP_DAILY_REQUEST_CAP` (20) a day. They also count against the site's own caps. When the cap is reached, the tool says so and points to the website.
- **Free repeats:** a search repeated within 10 minutes, or one that changes only the sort or filters, reuses the earlier result at no cost. Searches on the website and through MCP share that cache.
- **No booking-link tool:** each result includes `search_url`, the website's fares page with the same search filled in, where the traveller presses Book.
- **One airport pair per search:** the tool never searches a city's other airports (DXN, NMI, GOX), because each extra pair costs another request. That option is on the website only.
- **Guidance for assistants:** the tool tells them to search only once they know the route and date, and not to scan dates or routes.

## Things to ask

- "I'm flying from Delhi T1 tomorrow, domestic, with an Axis Atlas and an SBI PRIME card. Which lounges can I use?"
- "Which lounges at Bengaluru accept Priority Pass, and are they before or after security?"
- "What changed in the HDFC Regalia Gold lounge benefit this year, and where does it say so?"
- "What's landing at Mumbai in the next few minutes, and where is it coming from?"
- "What are the cheapest non-stop flights from Delhi to Bengaluru on 20 December?"

## Rules the assistant is given

The server tells connected assistants to:

- answer only from tool results and say when AeroGuide doesn't have something
- cite the source of each fact and say when a record is unverified or outdated
- use `check_lounge_access` for lounge questions instead of working out eligibility, and to pass on "depends" with its reasons
- remind travellers to confirm terminals with the airline or airport

How an assistant phrases its answer is up to that assistant. Treat answers as guidance and check with the bank or lounge before you travel.

## Limits

- **Rate limit:** 60 requests a minute per client address. One question usually takes a few tool calls. A `429` response says when to retry.
- **Host check:** requests must use AeroGuide's own hostname (protection against DNS rebinding).

## Running it yourself

The endpoint is part of the API, so `make dev-api` serves it at `http://localhost:8000/mcp`. Settings:

| Variable | Default | Purpose |
|---|---|---|
| `MCP_ENABLED` | `true` | Turn the endpoint off |
| `MCP_RATE_LIMIT_PER_MINUTE` | `60` | Requests per client address per minute |
| `FARES_MCP_DAILY_REQUEST_CAP` | `20` | Live fare searches all assistants may make per IST day (0 turns live searches off) |
| `SITE_URL` | `https://aeroguide-theta.vercel.app` | The website, for the fares-page links in results |
| `MCP_ALLOWED_HOSTS` | `localhost:*,127.0.0.1:*,[::1]:*,test` | Accepted Host headers. On Render, `RENDER_EXTERNAL_HOSTNAME` is added automatically |
