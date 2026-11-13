import { expect, test, type Page } from "@playwright/test";

/*
 * Airport directory, guide and map search against a mocked API. Fixture content is obviously
 * fake (Test City, terminal T9, "Test Air"), except codes that must exist in the static
 * airports layer for the map search.
 */

const CORS = { "access-control-allow-origin": "*" };

const summary = (iata: string, name: string, city: string, hasGuide = false) => ({
  iata,
  icao: `V${iata}`,
  name,
  city,
  state: "Test State",
  region: "North",
  lat: 28.5,
  lon: 77.1,
  size: "large",
  has_guide: hasGuide,
  status: "unverified",
});

const source = (name: string, type: string) => ({
  name,
  url: "https://example.org/source",
  publisher: null,
  source_type: type,
  retrieved_at: "2026-11-13",
});

function detail(withTerminal: boolean) {
  return {
    ...summary("DEL", "Test International Airport", "Test City", true),
    elevation_ft: 777,
    timezone: "Asia/Kolkata",
    official_source: source("Test airport website", "official_airport"),
    provenance: {
      status: "unverified",
      verified_at: null,
      reverify_due: null,
      source: source("Test geodata", "secondary"),
      notes: "Test geodata note.",
    },
    terminals: withTerminal
      ? [
          {
            code: "T9",
            name: "Test Terminal",
            role: "domestic",
            provenance: {
              status: "verified",
              verified_at: "2026-11-01",
              reverify_due: "2027-04-30",
              source: source("Test terminal page", "official_airport"),
              notes: null,
            },
            airlines: [
              {
                airline: { icao: "TST", iata: "T0", name: "Test Air" },
                operation: "domestic",
                scope_note: "test flights only",
                valid_from: "2026-01-01",
                valid_to: null,
                provenance: {
                  status: "unverified",
                  verified_at: null,
                  reverify_due: null,
                  source: null,
                  notes: null,
                },
              },
            ],
          },
        ]
      : [],
    terminal_note: "Always confirm the terminal on your boarding pass.",
  };
}

async function mockAirports(page: Page, opts: { withTerminal?: boolean; down?: boolean } = {}) {
  await page.route(/\/api\/v1\/airports(\?.*)?$/, (r) => {
    if (opts.down) return r.fulfill({ status: 503, headers: CORS, json: { detail: "down" } });
    const q = new URL(r.request().url()).searchParams.get("q");
    const items = [
      summary("DEL", "Test International Airport", "Test City", true),
      summary("TST", "Second Test Airport", "Other City"),
    ].filter((a) => !q || a.city.toLowerCase().includes(q.toLowerCase()));
    return r.fulfill({ headers: CORS, json: { items, total: items.length, limit: 60, offset: 0 } });
  });
  await page.route("**/api/v1/airports/DEL", (r) =>
    r.fulfill({ headers: CORS, json: detail(opts.withTerminal ?? false) }),
  );
  await page.route("**/api/v1/airports/ZZZ", (r) =>
    r.fulfill({ status: 404, headers: CORS, json: { detail: "No airport" } }),
  );
}

test("directory lists airports and filters by search", async ({ page }) => {
  await mockAirports(page);
  await page.goto("/airports");
  await expect(page.getByRole("heading", { name: "Airports", level: 1 })).toBeVisible();
  await expect(page.getByText("2 airports")).toBeVisible();
  await expect(page.getByText("Guide in progress")).toBeVisible();

  await page.getByRole("searchbox", { name: "Search airports" }).fill("other");
  await expect(page.getByText("1 airport", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/q=other/);
  await expect(page.getByText("Second Test Airport")).toBeVisible();
});

test("directory explains an outage instead of showing no results", async ({ page }) => {
  await mockAirports(page, { down: true });
  await page.goto("/airports");
  // Retries with backoff come first, so allow time for them.
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't load airports" })).toBeVisible({
    timeout: 30_000,
  });
});

test("guide without verified terminals says so and links the official site", async ({ page }) => {
  await mockAirports(page);
  await page.goto("/airports/del");
  await expect(page.getByRole("heading", { name: "Test International Airport" })).toBeVisible();
  await expect(page.getByText("Not yet verified").first()).toBeVisible();
  await expect(page.getByText("Terminal information not yet verified")).toBeVisible();
  await expect(page.getByText("boarding pass")).toBeVisible();
  await expect(page.getByRole("link", { name: /Official website/ }).first()).toHaveAttribute(
    "href",
    "https://example.org/source",
  );
});

test("guide shows terminals with their own provenance", async ({ page }) => {
  await mockAirports(page, { withTerminal: true });
  await page.goto("/airports/DEL");
  await expect(page.getByRole("heading", { name: /T9 Test Terminal/ })).toBeVisible();
  await expect(page.getByText(/Verified · checked/)).toBeVisible();
  await expect(page.getByText("test flights only")).toBeVisible();
});

test("unknown airport code shows a not-found state", async ({ page }) => {
  await mockAirports(page);
  await page.goto("/airports/zzz");
  await expect(page.getByText("No airport with code ZZZ")).toBeVisible();
});

test("map search finds an airport and links to its guide", async ({ page }) => {
  await page.route("**/api/v1/positions", (r) =>
    r.fulfill({ status: 503, headers: CORS, json: { detail: "down" } }),
  );
  await page.route(/tiles\.openfreemap\.org|rainviewer\.com/, (r) => r.abort());
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "Search airports" });
  await search.fill("bengal");
  await expect(
    page.getByRole("listbox", { name: "Airports" }).getByRole("option").first(),
  ).toContainText("BLR");
  await search.press("Enter");
  const card = page.getByRole("region", { name: "Airport BLR" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("link", { name: "Airport guide" })).toHaveAttribute(
    "href",
    "/airports/BLR",
  );
});

test("an airport link opens the map on that airport", async ({ page }) => {
  await page.route("**/api/v1/positions", (r) =>
    r.fulfill({ status: 503, headers: CORS, json: { detail: "down" } }),
  );
  await page.route(/tiles\.openfreemap\.org|rainviewer\.com/, (r) => r.abort());
  await page.goto("/?airport=MAA");
  await expect(page.getByRole("region", { name: "Airport MAA" })).toBeVisible();
});
