import { expect, test, type Page } from "@playwright/test";

/*
 * Live map behaviour against a mocked API, so CI doesn't depend on community data feeds.
 * Fixture aircraft use obviously fake identifiers (TEST…).
 */

const now = () => new Date().toISOString();
// Mocked responses still pass the browser's CORS check (the API is cross-origin).
const CORS = { "access-control-allow-origin": "*" };

function feature(
  id: string,
  callsign: string,
  coords: [number, number],
  extra: Record<string, unknown>,
) {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: coords },
    properties: {
      icao24: id,
      callsign,
      registration: `TEST-${id.slice(-1)}`,
      type_code: null,
      alt_baro_ft: null,
      on_ground: false,
      gs_kt: 420,
      track_deg: 200,
      vrate_fpm: 0,
      position_time: now(),
      is_demo: false,
      origin_iata: null,
      destination_iata: null,
      flight_number: null,
      ...extra,
    },
  };
}

function positions(mode: "live" | "unavailable" = "live") {
  const t = now();
  const features =
    mode === "live"
      ? [
          feature("aa0001", "TEST101", [77.1, 28.6], {
            origin_iata: "DEL",
            destination_iata: "BOM",
            flight_number: "TS101",
            type_code: "A20N",
            alt_baro_ft: 35000,
          }),
          feature("aa0002", "TEST202", [72.9, 19.1], { type_code: "B738", alt_baro_ft: 12000 }),
        ]
      : [];
  return {
    type: "FeatureCollection",
    features,
    meta: {
      mode,
      source: mode === "live" ? "test feed" : null,
      source_url: null,
      attribution: mode === "live" ? "Test data" : null,
      fetched_at: mode === "live" ? t : null,
      generated_at: t,
      count: features.length,
      message:
        mode === "live"
          ? null
          : "Live flight data is unavailable. The open data sources didn't respond.",
    },
  };
}

const airport = (iata: string, lat: number, lon: number, city: string) => ({
  iata,
  icao: null,
  name: null,
  city,
  country: "India",
  lat,
  lon,
});

async function mockApi(page: Page, mode: "live" | "unavailable" = "live") {
  await page.route("**/api/v1/positions", (r) =>
    r.fulfill({ json: positions(mode), headers: CORS }),
  );
  await page.route("**/api/v1/positions/aa0001", (r) =>
    r.fulfill({
      headers: CORS,
      json: {
        aircraft: {
          ...positions().features[0].properties,
          lat: 28.6,
          lon: 77.1,
          source: "test feed",
        },
        reported_route: {
          callsign: "TEST101",
          flight_number: "TS101",
          airline_name: "Test Airways",
          airline_iata: "TS",
          origin: airport("DEL", 28.56, 77.1, "Delhi"),
          destination: airport("BOM", 19.09, 72.87, "Mumbai"),
          source: "test routes",
          source_url: "https://example.org",
        },
        route_note: null,
        progress: {
          flown_km: 10,
          remaining_km: 1130,
          percent: 1,
          estimated_arrival: new Date(Date.now() + 90 * 60_000).toISOString(),
          minutes_remaining: 90,
        },
        meta: positions().meta,
      },
    }),
  );
  // Keep tests offline: no basemap, radar or tile requests.
  await page.route(/tiles\.openfreemap\.org|rainviewer\.com/, (r) => r.abort());
}

test.describe("desktop", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "desktop layout (sidebar)");
  });

  test("lists live aircraft with routes and counts", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    const sidebar = page.getByRole("complementary", { name: "Live air traffic" });
    await expect(sidebar.getByText("2 aircraft")).toBeVisible();
    const list = sidebar.getByRole("list", { name: "Aircraft" });
    await expect(list.getByText("TS101")).toBeVisible();
    await expect(list.getByText("Route not reported")).toBeVisible();
  });

  test("selecting a flight opens its panel with honest missing fields", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page
      .getByRole("list", { name: "Aircraft" })
      .getByRole("button", { name: /^TS101/ }) // the row, not its "Watch TS101" star
      .first()
      .click();
    const panel = page.getByRole("region", { name: "Flight TS101" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Test Airways")).toBeVisible();
    await expect(panel.getByText(/Not an airline schedule/)).toBeVisible();
    // Schedule data doesn't exist in open sources: shown as Not available, never invented.
    const scheduled = panel.locator("div", { has: page.getByText("Scheduled departure") }).last();
    await expect(scheduled.getByText("Not available")).toBeVisible();
    await panel.getByRole("button", { name: "Close flight details" }).click();
    await expect(panel).toBeHidden();
  });

  test("search and From filter narrow the list", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    const sidebar = page.getByRole("complementary", { name: "Live air traffic" });
    const search = sidebar.getByRole("searchbox", { name: "Search flights" });
    await search.fill("B738");
    await expect(sidebar.getByText(/^1 shown/)).toBeVisible();
    await search.fill("");
    await sidebar.getByRole("combobox", { name: "From airport" }).selectOption("DEL");
    await expect(sidebar.getByText(/^1 shown/)).toBeVisible();
    await expect(sidebar.getByRole("list", { name: "Aircraft" }).getByText("TS101")).toBeVisible();
  });

  test("watching a flight is remembered across reloads", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Watch TS101" }).click();
    await expect(page.getByRole("button", { name: /Alerts\s*\(1\)/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Stop watching TS101" })).toBeVisible();
  });
});

test("explains when live data is unavailable instead of showing an empty map", async ({ page }) => {
  await mockApi(page, "unavailable");
  await page.goto("/");
  await expect(
    page
      .getByText(/Live flight data is unavailable/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

test("mobile shows the flight list in a sheet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile only");
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Flights/ }).click();
  await expect(page.getByRole("dialog").getByText("TS101")).toBeVisible();
});
