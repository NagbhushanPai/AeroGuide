import { expect, test } from "@playwright/test";

const routes = [
  { path: "/", heading: /flights, airports and lounges/i },
  { path: "/live", heading: "Live Flights" },
  { path: "/airports", heading: "Airports" },
  { path: "/lounges", heading: "Lounges" },
  { path: "/cards", heading: "Cards" },
];

for (const { path, heading } of routes) {
  test(`${path} renders with the main navigation`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  });
}

test("every main nav link leads to a working page", async ({ page }) => {
  await page.goto("/");
  const links = page.getByRole("navigation", { name: "Main" }).getByRole("link");
  const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  for (const href of hrefs) {
    const response = await page.goto(href!);
    expect(response?.status(), href!).toBe(200);
  }
});

test("unknown routes show the not-found page", async ({ page }) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
