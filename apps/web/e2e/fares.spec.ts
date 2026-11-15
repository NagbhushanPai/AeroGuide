import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";

/*
 * Fare search against a mocked API. The shapes follow the generated FareSearchResponse and
 * BookingLinksResponse types; every seller here is fictional.
 */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST",
};

/** A date a few weeks ahead, so the form's "not in the past" rule always passes. */
const DEPART = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const NEXT_DAY = new Date(Date.parse(DEPART) + 86_400_000).toISOString().slice(0, 10);
const FETCHED_AT = new Date(Date.now() - 5 * 60_000).toISOString();

const PASSENGERS = { adults: 1, children: 0, infants_in_seat: 0, infants_on_lap: 0 };

function segment(o: {
  code: string;
  name: string;
  flight: string;
  from: string;
  to: string;
  dep: string;
  arr: string;
  minutes: number;
}) {
  return {
    carrier_code: o.code,
    carrier_name: o.name,
    flight_number: o.flight,
    origin: o.from,
    destination: o.to,
    departure_local: o.dep,
    departure_timezone: "Asia/Kolkata",
    departure_utc: null,
    arrival_local: o.arr,
    arrival_timezone: "Asia/Kolkata",
    arrival_utc: null,
    duration_minutes: o.minutes,
    aircraft: null,
  };
}

const nonstop = {
  id: "test-offer-1",
  provider: "ignav",
  is_demo: false,
  price: 4520,
  currency: "INR",
  price_verified: true,
  cabin: "economy",
  outbound: {
    origin: "DEL",
    destination: "BOM",
    departure_local: `${DEPART}T06:05:00`,
    departure_timezone: "Asia/Kolkata",
    arrival_local: `${DEPART}T08:25:00`,
    arrival_timezone: "Asia/Kolkata",
    duration_minutes: 140,
    stops: 0,
    carriers: ["6E"],
    carrier_names: ["IndiGo"],
    flight_numbers: ["6E6218"],
    segments: [
      segment({
        code: "6E",
        name: "IndiGo",
        flight: "6E6218",
        from: "DEL",
        to: "BOM",
        dep: `${DEPART}T06:05:00`,
        arr: `${DEPART}T08:25:00`,
        minutes: 140,
      }),
    ],
  },
  inbound: null,
  total_duration_minutes: 140,
  stops: 0,
  mixed_carriers: false,
  fetched_at: FETCHED_AT,
  booking: { provider: "ignav", reference: "test-ref-1" },
};

const oneStop = {
  ...nonstop,
  id: "test-offer-2",
  price: 123456,
  price_verified: false,
  outbound: {
    ...nonstop.outbound,
    departure_local: `${DEPART}T22:40:00`,
    arrival_local: `${NEXT_DAY}T03:10:00`,
    duration_minutes: 270,
    stops: 1,
    carriers: ["AI"],
    carrier_names: ["Air India"],
    flight_numbers: ["AI2421", "AI2422"],
    segments: [
      segment({
        code: "AI",
        name: "Air India",
        flight: "AI2421",
        from: "DEL",
        to: "HYD",
        dep: `${DEPART}T22:40:00`,
        arr: `${DEPART}T00:50:00`,
        minutes: 130,
      }),
      segment({
        code: "AI",
        name: "Air India",
        flight: "AI2422",
        from: "HYD",
        to: "BOM",
        dep: `${NEXT_DAY}T01:40:00`,
        arr: `${NEXT_DAY}T03:10:00`,
        minutes: 90,
      }),
    ],
  },
  total_duration_minutes: 270,
  stops: 1,
  booking: { provider: "ignav", reference: "test-ref-2" },
};

type Body = Record<string, unknown> & { sort?: string; max_stops?: number; airlines?: string[] };

function searchResponse(body: Body, opts: { demo?: boolean; nearLimit?: boolean }) {
  let offers = [nonstop, oneStop];
  if (typeof body.max_stops === "number") offers = offers.filter((o) => o.stops <= body.max_stops!);
  if (body.airlines?.length)
    offers = offers.filter((o) => body.airlines!.includes(o.outbound.carriers[0]));
  if (body.sort === "cheapest") offers = [...offers].sort((a, b) => a.price - b.price);
  if (body.sort === "fastest")
    offers = [...offers].sort((a, b) => a.total_duration_minutes - b.total_duration_minutes);
  return {
    origin: "DEL",
    destination: "BOM",
    departure_date: DEPART,
    return_date: null,
    passengers: PASSENGERS,
    cabin: "economy",
    routes: ["DEL-BOM"],
    sort: body.sort ?? "best",
    offers: offers.map((o) => ({ ...o, is_demo: !!opts.demo })),
    total_offers: 2,
    excluded_abroad: 3,
    airlines: [
      { code: "6E", name: "IndiGo", offers: 1 },
      { code: "AI", name: "Air India", offers: 1 },
    ],
    fetched_at: FETCHED_AT,
    cached: false,
    is_demo: !!opts.demo,
    providers: [{ provider: "ignav", status: "ok", offers: 2, message: null }],
    budget: opts.nearLimit
      ? {
          provider: "ignav",
          used: 90,
          cap: 100,
          today: 9,
          daily_cap: 10,
          near_limit: true,
          message: "Fare searches are nearly used up for today.",
        }
      : null,
    notice: "Test notice: prices come from the fare source and can change.",
  };
}

async function mock(
  page: Page,
  opts: {
    demo?: boolean;
    nearLimit?: boolean;
    searchError?: { status: number; detail: string };
  } = {},
) {
  const searches: Body[] = [];
  await page.route("**/api/v1/fares/search", async (r) => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
    const body = r.request().postDataJSON() as Body;
    searches.push(body);
    if (opts.searchError)
      return r.fulfill({
        status: opts.searchError.status,
        headers: CORS,
        json: { detail: opts.searchError.detail },
      });
    return r.fulfill({ headers: CORS, json: searchResponse(body, opts) });
  });
  await page.route("**/api/v1/fares/booking-links", async (r) => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: CORS });
    const { provider, reference } = r.request().postDataJSON() as Record<string, string>;
    return r.fulfill({
      headers: CORS,
      json: {
        provider,
        reference,
        links: [
          {
            seller: "Test Travel Agency",
            seller_type: "ota",
            fare_name: "Saver",
            price: 4710,
            currency: "INR",
            url: "https://example.org/agency",
          },
          {
            seller: "Test Airline",
            seller_type: "airline",
            fare_name: null,
            price: 4520,
            currency: "INR",
            url: "https://example.org/airline",
          },
        ],
        budget: null,
      },
    });
  });
  return searches;
}

const isSearch = (req: Request) =>
  req.url().endsWith("/api/v1/fares/search") && req.method() === "POST";

/** The form's own Search button (the header has a site search button too). */
const searchButton = (page: Page) =>
  page
    .getByRole("form", { name: "Search fares" })
    .getByRole("button", { name: "Search", exact: true });

const READY_URL = `/fares?from=DEL&to=BOM&depart=${DEPART}`;

async function searchFromUrl(page: Page) {
  await page.goto(READY_URL);
  await expect(page.getByRole("heading", { name: "Ready to search" })).toBeVisible();
  await searchButton(page).click();
  return page.getByRole("region", { name: /New Delhi \(DEL\) to Mumbai \(BOM\)/ });
}

/** Filters sit behind a disclosure on narrow screens. */
async function openFilters(page: Page) {
  const toggle = page.getByRole("button", { name: /^Filters/ });
  if (await toggle.isVisible()) await toggle.click();
}

test("search stays disabled with a reason until the form is complete", async ({ page }) => {
  const searches = await mock(page);
  await page.goto("/fares");
  const search = searchButton(page);
  await expect(search).toBeDisabled();
  await expect(page.getByText("Pick where you're flying from and to.")).toBeVisible();

  const from = page.getByRole("combobox", { name: "From" });
  await from.fill("del");
  await from.press("Tab");
  await expect(page.getByText("Pick where you're flying to.")).toBeVisible();
  await expect(page).toHaveURL(/from=DEL/);

  const to = page.getByRole("combobox", { name: "To" });
  await to.fill("del");
  await to.press("Tab");
  await expect(page.getByText(/From and To are the same airport/)).toBeVisible();

  await page.getByRole("button", { name: "Swap From and To" }).click();
  await to.fill("bom");
  await to.press("Tab");
  await expect(page.getByText("Pick a departure date.")).toBeVisible();
  // DEL has a second airport: the option to add it appears.
  await expect(page.getByText(/Also search the city's other airport/)).toBeVisible();
  await expect(page.getByText(/searches more airport pairs|one more airport pair/)).toBeVisible();

  await page.getByLabel("Departure").fill(DEPART);
  await page.getByRole("radio", { name: "Round trip" }).check();
  await expect(page.getByText("Pick a return date, or choose One way.")).toBeVisible();
  await page.getByRole("radio", { name: "One way" }).check();
  await expect(search).toBeEnabled();
  expect(searches).toHaveLength(0);
});

test("a shared link fills the form but doesn't search until asked", async ({ page }) => {
  const searches = await mock(page);
  await page.goto(`${READY_URL}&adults=2&cabin=business&sort=cheapest`);
  await expect(page.getByRole("heading", { name: "Ready to search" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "From" })).toHaveValue("New Delhi (DEL)");
  await expect(page.getByRole("button", { name: /Passengers 2 adults/ })).toBeVisible();
  await expect(page.getByLabel("Cabin")).toHaveValue("business");
  await page.waitForTimeout(500);
  expect(searches).toHaveLength(0);
});

test("results show prices, times and stops; sort and filters ask again", async ({ page }) => {
  const searches = await mock(page);
  const results = await searchFromUrl(page);
  await expect(results.getByRole("heading", { level: 2 })).toBeFocused();
  await expect(results.getByText("2 of 2 fares")).toBeVisible();
  await expect(results.getByText(/Prices fetched 5 min ago/)).toBeVisible();

  expect(searches[0]).toEqual({
    origin: "DEL",
    destination: "BOM",
    departure_date: DEPART,
    passengers: PASSENGERS,
    cabin: "economy",
    nearby_airports: false,
    sort: "best",
  });

  const cards = results.getByRole("article");
  await expect(cards).toHaveCount(2);
  const first = cards.filter({ hasText: "IndiGo" });
  await expect(first.getByText("₹4,520")).toBeVisible();
  await expect(first.getByText("Non-stop")).toBeVisible();
  await expect(first.getByText("2h 20m")).toBeVisible();
  await expect(first.getByText("06:05")).toBeVisible();
  const second = cards.filter({ hasText: "Air India" });
  await expect(second.getByText("₹1,23,456")).toBeVisible();
  await expect(second.getByText("1 stop via HYD")).toBeVisible();
  await expect(second.getByText("+1")).toBeVisible();
  await expect(second.getByText("Unconfirmed price")).toBeVisible();
  await expect(
    results.getByText("3 itineraries connecting outside India aren't shown"),
  ).toBeVisible();
  await expect(results.getByText("Test notice: prices come from the fare source")).toBeVisible();

  // Sort: a new request with the same search and sort=cheapest.
  const sorted = page.waitForRequest((r) => isSearch(r) && r.postDataJSON().sort === "cheapest");
  await results.getByRole("button", { name: "Cheapest" }).click();
  await sorted;
  await expect(results.getByRole("button", { name: "Cheapest" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page).toHaveURL(/sort=cheapest/);

  // Filter: non-stop only.
  await openFilters(page);
  const filtered = page.waitForRequest((r) => isSearch(r) && r.postDataJSON().max_stops === 0);
  await results.getByRole("radio", { name: "Non-stop" }).check();
  const body = (await filtered).postDataJSON();
  expect(body).toMatchObject({ origin: "DEL", destination: "BOM", sort: "cheapest", max_stops: 0 });
  await expect(results.getByText("1 of 2 fares")).toBeVisible();
  await expect(results.getByRole("article")).toHaveCount(1);

  // Departure window and airline.
  const timed = page.waitForRequest((r) => isSearch(r) && r.postDataJSON().depart_after_hour === 6);
  await results.getByRole("radio", { name: /^Morning/ }).check();
  expect((await timed).postDataJSON()).toMatchObject({
    depart_after_hour: 6,
    depart_before_hour: 12,
    max_stops: 0,
  });

  const airline = page.waitForRequest(
    (r) => isSearch(r) && (r.postDataJSON().airlines ?? []).includes("AI"),
  );
  await results.getByRole("checkbox", { name: /Air India/ }).check();
  await airline;
  await expect(page.getByText("No flights match these filters")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(results.getByText("2 of 2 fares")).toBeVisible();
});

test("Book fetches the sellers only when asked, cheapest first", async ({ page }) => {
  await mock(page);
  let bookingCalls = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/fares/booking-links") && r.method() === "POST") bookingCalls++;
  });
  const results = await searchFromUrl(page);
  await expect(results.getByRole("article")).toHaveCount(2);
  expect(bookingCalls).toBe(0);

  const card = results.getByRole("article").filter({ hasText: "IndiGo" });
  const sent = page.waitForRequest((r) => r.url().endsWith("/fares/booking-links"));
  await card.getByRole("button", { name: "Book" }).click();
  expect((await sent).postDataJSON()).toEqual({ provider: "ignav", reference: "test-ref-1" });

  const links = card.getByRole("link");
  await expect(links).toHaveCount(2);
  await expect(links.first()).toContainText("Test Airline");
  await expect(links.first()).toContainText("₹4,520");
  await expect(links.first()).toHaveAttribute("target", "_blank");
  await expect(links.first()).toHaveAttribute("rel", "noopener noreferrer");
  await expect(links.first()).toHaveAccessibleName(/opens in a new tab/);
  await expect(links.nth(1)).toContainText("Test Travel Agency");
});

test("a used-up budget shows the API's own message", async ({ page }) => {
  await mock(page, {
    searchError: { status: 429, detail: "Today's fare searches are used up. Try again tomorrow." },
  });
  await page.goto(READY_URL);
  await searchButton(page).click();
  const alert = page.locator("#main").getByRole("alert");
  await expect(alert).toContainText("Today's fare searches are used up. Try again tomorrow.");
  await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);
});

test("a failed search can be tried again by hand", async ({ page }) => {
  const searches = await mock(page, {
    searchError: { status: 504, detail: "The fare source took too long." },
  });
  await page.goto(READY_URL);
  await searchButton(page).click();
  await expect(page.locator("#main").getByRole("alert")).toContainText(
    "The fare source took too long.",
  );
  // No automatic retries: each search can cost money.
  await page.waitForTimeout(500);
  expect(searches).toHaveLength(1);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => searches.length).toBe(2);
});

test("demo fares are labelled and a near budget is a gentle note", async ({ page }) => {
  await mock(page, { demo: true, nearLimit: true });
  const results = await searchFromUrl(page);
  await expect(results.getByText(/Demo data: not real fares/i)).toBeVisible();
  await expect(results.getByText("Fare searches are nearly used up for today.")).toBeVisible();
  await expect(page.locator("#main").getByRole("alert")).toHaveCount(0);
});

test("results fit a phone without sideways scrolling", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const results = await searchFromUrl(page);
  await expect(results.getByRole("article")).toHaveCount(2);
  await openFilters(page);
  await results.getByRole("article").first().getByRole("button", { name: "Book" }).click();
  await expect(results.getByRole("link").first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const theme of ["dark", "light"] as const) {
  test(`results have no serious accessibility violations (${theme})`, async ({ page }) => {
    await mock(page, { demo: true, nearLimit: true });
    await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
    const results = await searchFromUrl(page);
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
    await expect(results.getByRole("article")).toHaveCount(2);
    await openFilters(page);
    await results.getByRole("article").first().getByRole("button", { name: "Book" }).click();
    await expect(results.getByRole("link").first()).toBeVisible();
    // Hover styles are transient; scan the resting state.
    await page.mouse.move(0, 0);
    const scan = await new AxeBuilder({ page }).analyze();
    const serious = scan.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  });
}
