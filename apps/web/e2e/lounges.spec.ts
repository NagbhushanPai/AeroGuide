import { expect, test, type Page } from "@playwright/test";

/*
 * Lounges, cards, the checker and site search against a mocked API. Every bank, card, lounge and
 * programme here is fictional (Test Bank, Test Voyager, Test Lounge).
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
const SAVED_KEY = "aeroguide.checker.cards";
const programme = { key: "test-programme", name: "Test Lounge Programme" };
const lounge = {
  slug: "test-lounge-del-t9",
  name: "Test Lounge",
  iata: "DEL",
  airport_name: "Test International Airport",
  city: "Test City",
  terminal: "T9",
  scope: "domestic",
  side: "airside",
  direction: "departures",
  status: "verified",
  programs: [programme],
};
const arrivals = {
  ...lounge,
  slug: "test-arrivals-del",
  name: "Test Arrivals Lounge",
  side: "landside",
  direction: "arrivals",
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

function loungeDetail(base: typeof lounge) {
  return {
    ...base,
    operator: "Test Operator",
    location_text: "Near test gate 1",
    nearest_gate: null,
    opening_hours: { mode: "24h", periods: [] },
    amenities: [{ code: "wifi", label: "Wi-Fi" }],
    accepts: [
      {
        program: { ...programme, kind: "membership", url: null },
        paid_price: null,
        currency: null,
        paid_duration_min: null,
        valid_from: "2026-01-01",
        valid_to: null,
        in_force: true,
        provenance,
      },
    ],
    cards:
      base.direction === "departures"
        ? [
            {
              slug: card.slug,
              name: card.name,
              bank: bank.name,
              status: "verified",
              scope: "domestic",
              via: programme,
            },
          ]
        : [],
    provenance,
  };
}

async function mock(page: Page, opts: { empty?: boolean } = {}) {
  await page.route(/\/api\/v1\/lounges(\?.*)?$/, (r) =>
    r.fulfill({ headers: CORS, json: { items: opts.empty ? [] : [lounge, arrivals] } }),
  );
  await page.route("**/api/v1/lounges/test-lounge-del-t9", (r) =>
    r.fulfill({ headers: CORS, json: loungeDetail(lounge) }),
  );
  await page.route("**/api/v1/lounges/test-arrivals-del", (r) =>
    r.fulfill({ headers: CORS, json: loungeDetail(arrivals) }),
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
  const scopes = [{ scope: "domestic", programs: [programme], lounge_list_known: true }];
  await page.route("**/api/v1/cards/test-bank-voyager", (r) =>
    r.fulfill({
      headers: CORS,
      json: {
        ...card,
        product_url: "https://example.org/bank/voyager",
        provenance,
        policies: [
          {
            scope: "domestic",
            valid_from: "2026-01-01",
            valid_to: null,
            in_force: true,
            summary: card.domestic,
            rules: [{ type: "program_entitlement", program: "test-programme" }],
            unmodelled_terms: null,
            provenance: { ...provenance, source: { ...provenance.source, source_type: "bank" } },
          },
        ],
        programs: scopes,
      },
    }),
  );
  await page.route("**/api/v1/cards/test-bank-voyager/lounges", (r) =>
    r.fulfill({ headers: CORS, json: { card: card.slug, scopes, lounges: [lounge] } }),
  );
  await page.route(/\/api\/v1\/search\?/, (r) => {
    const q = new URL(r.request().url()).searchParams.get("q") ?? "";
    const items = /voy/i.test(q)
      ? [
          {
            kind: "card",
            key: card.slug,
            title: card.name,
            subtitle: bank.name,
            href: `/cards/${card.slug}`,
          },
        ]
      : [];
    return r.fulfill({ headers: CORS, json: { q, items } });
  });
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
                        message: "Accepted through Test Lounge Programme.",
                      },
                    ]
                  : [
                      {
                        rule: "spend_gate",
                        status: "depends",
                        message: "Needs ₹50,000 spent in the previous calendar quarter.",
                        detail: "Test wording: spend ₹50,000 in the previous quarter.",
                      },
                    ],
                via_programs: ["test-programme"],
                guests_covered: null,
                entry: ["card_swipe"],
                notes: ["Test note: a fee applies for guests."],
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

test("lounge directory names airports, filters from the URL and marks arrivals", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/lounges?airport=DEL");
  await expect(
    page.getByRole("heading", { name: /Test City · Test International Airport \(DEL\)/ }),
  ).toBeVisible();
  await expect(page.getByText("2 of 2 lounges")).toBeVisible();
  await expect(page.getByText("Arrivals lounge", { exact: true })).toBeVisible();

  const before = page.getByRole("button", { name: "Before security" });
  await before.click();
  await expect(before).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/side=landside/);
  await expect(page.getByText("1 of 2 lounges")).toBeVisible();
  await expect(page.getByRole("link", { name: /Test Lounge.*Accepts/ })).toHaveCount(0);
});

test("lounge page shows hours, programmes, amenities and the cards that may get in", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/lounges");
  await page.getByRole("link", { name: /^T9 Test Lounge/ }).click();
  await expect(page.getByRole("heading", { name: "Test Lounge", level: 1 })).toBeVisible();
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link", { name: "Test City (DEL)" })).toHaveAttribute(
    "href",
    "/airports/DEL",
  );
  await expect(page.getByText("Open 24 hours")).toBeVisible();
  await expect(
    page.getByRole("paragraph").filter({ hasText: /^Test Lounge Programme$/ }),
  ).toBeVisible();
  await expect(page.getByText("Wi-Fi")).toBeVisible();
  await expect(page.getByText(/not stated.*not .not available/i)).toBeVisible();

  const cards = page.getByRole("region", { name: "Cards that may get you in" });
  await expect(cards.getByRole("link", { name: /Test Voyager/ })).toHaveAttribute(
    "href",
    "/cards/test-bank-voyager",
  );
  await expect(cards.getByText(/through Test Lounge Programme/)).toBeVisible();
  await expect(cards.getByRole("link", { name: "Check with my cards" })).toHaveAttribute(
    "href",
    "/cards?airport=DEL&scope=domestic#check",
  );
});

test("arrivals lounge explains why no cards are matched", async ({ page }) => {
  await mock(page);
  await page.goto("/lounges/test-arrivals-del");
  const cards = page.getByRole("region", { name: "Cards that may get you in" });
  await expect(cards.getByText(/This is an arrivals lounge/)).toBeVisible();
  await expect(cards.getByRole("link")).toHaveCount(0);
});

test("cards page lists issuers even with no cards recorded", async ({ page }) => {
  await mock(page, { empty: true });
  await page.goto("/cards");
  await expect(page.getByText("No card lounge benefits are recorded yet")).toBeVisible();
  await expect(page.getByText(/these 2 issuers/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Other Test Bank/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeDisabled();
  await expect(page.getByText("Pick at least one card and an airport.")).toBeVisible();
});

test("checker answers per lounge, remembers only the cards, and forgets them", async ({ page }) => {
  await mock(page);
  await page.goto("/cards");

  const picker = page.getByRole("combobox", { name: "Your cards" });
  await picker.fill("voyager");
  await page.getByRole("option", { name: /Test Voyager/ }).click();
  await expect(page.getByRole("list", { name: "Chosen cards" })).toContainText("Test Voyager");
  await expect(page.getByText("Your card choice is saved in this browser only.")).toBeVisible();

  const airport = page.getByRole("combobox", { name: "Airport" });
  await airport.fill("del");
  await airport.press("Tab");
  await expect(page).toHaveURL(/airport=DEL/);
  await page.getByRole("button", { name: "Check", exact: true }).click();

  const results = page.getByRole("region", {
    name: "Test City (DEL) · Domestic · 20 Nov 2026",
  });
  await expect(results.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(results.getByRole("link", { name: "Test Lounge" })).toHaveAttribute(
    "href",
    "/lounges/test-lounge-del-t9",
  );
  await expect(results.getByText("Depends", { exact: true })).toBeVisible();
  await expect(results.getByText(/Needs ₹50,000/)).toBeVisible();
  await expect(results.getByText("Test note: a fee applies for guests.")).toBeVisible();
  await expect(results.getByText("Test wording: spend ₹50,000")).toBeHidden();
  await results.getByText("Show the bank's wording").click();
  await expect(results.getByText(/Test wording: spend ₹50,000/)).toBeVisible();
  await expect(results.getByText("Test disclaimer: the bank decides.")).toBeVisible();

  await page.getByRole("textbox", { name: /Visits used this period/ }).fill("1");
  await page.getByRole("textbox", { name: /Spend so far/ }).fill("60,000");
  await expect(results.getByText(/results are for your earlier choices/)).toBeVisible();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(results.getByText("Likely yes", { exact: true })).toBeVisible();
  await expect(results.getByText(/Swipe the card/)).toBeVisible();

  // Only the card choice is kept, in this browser: no spend, no airport, nothing in the URL.
  expect(page.url()).not.toContain("voyager");
  const stored: Record<string, string> = await page.evaluate(() => ({
    ...localStorage,
    ...sessionStorage,
  }));
  expect(stored[SAVED_KEY]).toBe('["test-bank-voyager"]');
  const others = Object.entries(stored).filter(([k]) => k !== SAVED_KEY);
  expect(JSON.stringify(others)).not.toContain("voyager");
  expect(JSON.stringify(stored)).not.toContain("60000");
  expect(JSON.stringify(stored)).not.toContain("DEL");

  // A refresh keeps the airport (URL) and the card (browser), and checks again by itself.
  await page.reload();
  await expect(page.getByRole("list", { name: "Chosen cards" })).toContainText("Test Voyager");
  await expect(page.getByRole("heading", { name: /Test City \(DEL\) · Domestic/ })).toBeVisible();

  await page.getByRole("button", { name: "Forget" }).click();
  await expect(page.getByRole("list", { name: "Chosen cards" })).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), SAVED_KEY)).toBeNull();
});

test("checker rejects numbers it can't read instead of guessing", async ({ page }) => {
  await mock(page);
  await page.goto("/cards?card=test-bank-voyager&airport=DEL");
  await expect(page).not.toHaveURL(/card=/);
  const visits = page.getByRole("textbox", { name: /Visits used this period/ });
  await visits.fill("abc");
  await expect(page.getByText("Enter a whole number, like 1.")).toBeVisible();
  await expect(visits).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeDisabled();
});

test("card page lists the lounges it opens and links to the checker", async ({ page }) => {
  await mock(page);
  await page.goto("/cards/test-bank-voyager");
  await expect(page.getByRole("heading", { name: "Test Voyager", level: 1 })).toBeVisible();
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link", { name: "Test Bank" })).toBeVisible();
  await expect(page.getByText("Access through Test Lounge Programme")).toBeVisible();

  const opens = page.getByRole("region", { name: "Lounges this card opens" });
  await expect(opens.getByRole("link", { name: /Test City \(DEL\)/ })).toBeVisible();
  await expect(opens.getByRole("link", { name: /Test Lounge/ })).toHaveAttribute(
    "href",
    "/lounges/test-lounge-del-t9",
  );
  await expect(opens.getByRole("link", { name: "Check at an airport" })).toHaveAttribute(
    "href",
    "/cards?card=test-bank-voyager",
  );
});

test("site search opens with Ctrl+K and goes to a result", async ({ page }) => {
  await mock(page);
  await page.goto("/lounges");
  await expect(page.getByRole("heading", { level: 1, name: "Lounges" })).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Search AeroGuide" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("voy");
  await expect(dialog.getByRole("group", { name: "Cards" })).toBeVisible();
  await dialog.getByRole("combobox").press("Enter");
  await expect(page).toHaveURL(/\/cards\/test-bank-voyager$/);

  await page.keyboard.press("Control+k");
  await page.getByRole("dialog").getByRole("combobox").fill("zzz");
  await expect(page.getByText(/No airports, lounges or cards match/)).toBeVisible();
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
  await expect(section.getByRole("link", { name: "All lounges at DEL" })).toHaveAttribute(
    "href",
    "/lounges?airport=DEL",
  );
});
