import { expect, test, type Page } from "@playwright/test";

/*
 * Lounges, cards and the checker against a mocked API. Every bank, card, lounge and programme
 * here is fictional (Test Bank, Test Voyager, Test Lounge).
 */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST",
};
const provenance = {
  status: "verified",
  verified_at: "2026-11-01",
  reverify_due: "2026-12-31",
  source: {
    name: "Test source",
    url: "https://example.org/source",
    publisher: null,
    source_type: "lounge_operator",
    retrieved_at: "2026-11-01",
  },
  notes: null,
};
const lounge = {
  slug: "test-lounge-del-t9",
  name: "Test Lounge",
  iata: "DEL",
  terminal: "T9",
  scope: "domestic",
  side: "airside",
  status: "verified",
  programs: ["Test Lounge Programme"],
};
const bank = { slug: "test-bank", name: "Test Bank", url: "https://example.org/bank" };
const card = {
  slug: "test-bank-voyager",
  name: "Test Voyager",
  bank,
  network: "Visa",
  status: "verified",
  domestic: "2 visits a quarter after spending ₹50,000.",
  international: null,
};

async function mock(page: Page, opts: { empty?: boolean } = {}) {
  await page.route(/\/api\/v1\/lounges(\?.*)?$/, (r) =>
    r.fulfill({ headers: CORS, json: { items: opts.empty ? [] : [lounge] } }),
  );
  await page.route("**/api/v1/lounges/test-lounge-del-t9", (r) =>
    r.fulfill({
      headers: CORS,
      json: {
        ...lounge,
        airport_name: "Test International Airport",
        operator: "Test Operator",
        location_text: "Near test gate 1",
        nearest_gate: null,
        opening_hours: { mode: "24h", periods: [] },
        amenities: [{ code: "wifi", label: "Wi-Fi" }],
        accepts: [
          {
            program: {
              key: "test-programme",
              name: "Test Lounge Programme",
              kind: "membership",
              url: null,
            },
            paid_price: null,
            currency: null,
            paid_duration_min: null,
            valid_from: "2026-01-01",
            valid_to: null,
            provenance,
          },
        ],
        provenance,
      },
    }),
  );
  await page.route(/\/api\/v1\/cards(\?.*)?$/, (r) =>
    r.fulfill({
      headers: CORS,
      json: {
        items: opts.empty ? [] : [card],
        banks: [bank, { ...bank, slug: "other", name: "Other Test Bank" }],
      },
    }),
  );
  await page.route("**/api/v1/eligibility", async (r) => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
    const body = r.request().postDataJSON() as {
      cards: string[];
      facts?: Record<string, { visits_used?: number | null; spend_inr?: number | null }>;
    };
    const f = body.facts?.["test-bank-voyager"];
    const met = (f?.spend_inr ?? 0) >= 50000 && f?.visits_used != null && f.visits_used < 2;
    await r.fulfill({
      headers: CORS,
      json: {
        airport: "DEL",
        on: "2026-11-20",
        scope: "domestic",
        lounges_listed: 1,
        unknown_cards: [],
        disclaimer: "Test disclaimer: the bank decides.",
        results: [
          {
            card,
            lounges: [
              {
                lounge,
                status: met ? "yes" : "depends",
                checks: met
                  ? [
                      {
                        rule: "program_entitlement",
                        status: "yes",
                        message: "Accepted through test-programme.",
                      },
                    ]
                  : [
                      {
                        rule: "spend_gate",
                        status: "depends",
                        message: "Needs ₹50,000 spent in the previous calendar quarter.",
                      },
                    ],
                via_programs: ["test-programme"],
                guests_covered: null,
                entry: ["card_swipe"],
                policy_summary: card.domestic,
              },
            ],
          },
        ],
      },
    });
  });
  await page.route(/tiles\.openfreemap\.org|rainviewer\.com/, (r) => r.abort());
}

test("lounge directory shows an honest empty state", async ({ page }) => {
  await mock(page, { empty: true });
  await page.goto("/lounges");
  await expect(page.getByText("No lounges recorded yet")).toBeVisible();
  await expect(page.getByRole("link", { name: /Add a lounge/ })).toHaveAttribute(
    "href",
    /CONTRIBUTING/,
  );
});

test("lounge page shows hours, programmes and amenities with sources", async ({ page }) => {
  await mock(page);
  await page.goto("/lounges");
  await page.getByRole("link", { name: /Test Lounge/ }).click();
  await expect(page.getByRole("heading", { name: "Test Lounge", level: 1 })).toBeVisible();
  await expect(page.getByText("Open 24 hours")).toBeVisible();
  await expect(page.getByText("Test Lounge Programme", { exact: true })).toBeVisible();
  await expect(page.getByText("Wi-Fi")).toBeVisible();
  await expect(page.getByText(/not stated.*not .not available/i)).toBeVisible();
});

test("cards page lists issuers even with no cards recorded", async ({ page }) => {
  await mock(page, { empty: true });
  await page.goto("/cards");
  await expect(page.getByText("No card lounge benefits are recorded yet")).toBeVisible();
  await expect(page.getByText("Other Test Bank")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check" })).toBeDisabled();
});

test("checker explains depends, then yes, and stores nothing", async ({ page }) => {
  await mock(page);
  await page.goto("/cards");
  await page.getByRole("checkbox", { name: /Test Voyager/ }).check();
  await page.getByRole("combobox", { name: "Airport" }).fill("del");
  await page.getByRole("button", { name: "Check" }).click();

  const results = page.getByRole("region", { name: /DEL · domestic/ });
  await expect(results.getByText("Depends")).toBeVisible();
  await expect(results.getByText(/Needs ₹50,000/)).toBeVisible();
  await expect(results.getByText("Test disclaimer: the bank decides.")).toBeVisible();

  await page.getByRole("textbox", { name: "Visits used this period" }).fill("1");
  await page.getByRole("textbox", { name: /Spend in the bank/ }).fill("60,000");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(results.getByText("Likely yes")).toBeVisible();
  await expect(results.getByText(/Swipe the card/)).toBeVisible();

  // Nothing about the check is kept: not in the URL, not in browser storage.
  expect(page.url()).not.toContain("voyager");
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain("voyager");
  expect(stored).not.toContain("60000");
});

test("airport guide lists its lounges and links to the checker", async ({ page }) => {
  await mock(page);
  await page.route("**/api/v1/airports/DEL", (r) =>
    r.fulfill({
      headers: CORS,
      json: {
        iata: "DEL",
        icao: "VIDP",
        name: "Test International Airport",
        city: "Test City",
        state: "Test State",
        region: "North",
        lat: 28.5,
        lon: 77.1,
        size: "large",
        has_guide: true,
        status: "unverified",
        elevation_ft: 777,
        timezone: "Asia/Kolkata",
        official_source: null,
        provenance: { ...provenance, status: "unverified", verified_at: null, reverify_due: null },
        terminals: [],
        mapped_terminals: null,
        terminal_note: "Confirm your terminal.",
      },
    }),
  );
  await page.route("**/api/v1/airports/DEL/airlines-seen*", (r) =>
    r.fulfill({ status: 503, headers: CORS, json: {} }),
  );
  await page.goto("/airports/DEL");
  const section = page.getByRole("region", { name: "Lounges" });
  await expect(section.getByText("Test Lounge", { exact: true })).toBeVisible();
  await expect(section.getByRole("link", { name: /Check which of your cards/ })).toHaveAttribute(
    "href",
    "/cards?airport=DEL",
  );
});
