import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const routes = [
  { path: "/", heading: "Live flight map of India" },
  { path: "/about", heading: /flights, airports and lounges/i },
  { path: "/airports", heading: "Airports" },
  { path: "/lounges", heading: "Lounges" },
  { path: "/cards", heading: "Cards" },
  { path: "/design-system", heading: "Design system" },
];

/** Desktop shows the inline nav; small screens show a menu button that opens a sheet. */
async function expectNavigation(page: Page) {
  const isMobile = (page.viewportSize()?.width ?? 1280) < 640;
  if (isMobile) {
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  } else {
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  }
}

for (const { path, heading } of routes) {
  test(`${path} renders with navigation`, async ({ page }) => {
    await page.goto(path);
    // The map page's h1 is visually hidden (sr-only): check it exists rather than is visible.
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeAttached();
    await expectNavigation(page);
  });

  for (const theme of ["dark", "light"] as const) {
    test(`${path} has no serious accessibility violations (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(new RegExp(theme));
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(serious.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    });
  }
}

test("every main nav link leads to a working page", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "inline nav is hidden on mobile; covered by the menu test",
  );
  await page.goto("/");
  const links = page.getByRole("navigation", { name: "Main" }).getByRole("link");
  const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  expect(hrefs).toHaveLength(5);
  for (const href of hrefs) {
    const response = await page.goto(href!);
    expect(response?.status(), href!).toBe(200);
  }
});

test("mobile menu opens and navigates", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile only");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const menu = page.getByRole("navigation", { name: "Mobile" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Airports" }).click();
  await expect(page).toHaveURL(/\/airports$/);
  await expect(page.getByRole("heading", { level: 1, name: "Airports" })).toBeVisible();
});

test("theme toggle switches and remembers the theme", async ({ page }) => {
  await page.goto("/about");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Switch colour theme" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
});

test("/live redirects to the live map", async ({ page }) => {
  await page.goto("/live");
  await expect(page).toHaveURL(/\/$/);
});

test("unknown routes show the not-found page", async ({ page }) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("design system page is not indexed", async ({ page }) => {
  await page.goto("/design-system");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
