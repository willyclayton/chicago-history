import { expect, test } from "@playwright/test";

const mapReady = (page: import("@playwright/test").Page) =>
  page.waitForFunction(() => {
    const m = (window as unknown as { __map?: { getLayer(id: string): unknown } }).__map;
    return !!m && !!m.getLayer("sites");
  });

test("desktop: deep link, timeline, search, stepping, back, shortcuts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("./?nocoach#valentine");
  const card = page.locator("#card");
  await expect(card.locator("h2")).toHaveText("St. Valentine's Day Massacre");
  await expect(page.locator("#yearOut")).toHaveText(/^\d{4}$/);
  await mapReady(page);

  // back to the list
  await card.getByRole("button", { name: "Back to all sites" }).click();
  await expect(page.locator("#list")).toBeVisible();
  await expect(page).not.toHaveURL(/#valentine/);

  // slider at 1850
  await page.locator("#year").fill("1850");
  await expect(page.locator("#countOut")).toHaveText("5 of 67 sites by 1850");
  await expect(page.locator(".mklist button")).toHaveCount(5);

  // "/" focuses search; results filter live; Enter opens the first
  await page.locator("body").press("/");
  await expect(page.locator("#q")).toBeFocused();
  await page.keyboard.type("capone");
  await expect(page.locator("#list button[data-id]")).toHaveCount(2);
  await page.keyboard.press("Escape"); // clears the search
  await expect(page.locator("#q")).toHaveValue("");

  // hovering a row previews it on the map
  await page.locator('#list button[data-id="dusable"]').hover();
  await expect(page.locator(".maptip")).toHaveClass(/on/);

  // pick a row, then step with the arrow keys
  await page.locator('#list button[data-id="fire"]').click();
  await expect(page.locator("#yearOut")).toHaveText("1871");
  await expect(card.locator("h2")).toHaveText("Great Chicago Fire");
  await page.locator("body").press("ArrowRight");
  await expect(page.locator("#yearOut")).not.toHaveText("1871");
  await expect(page).toHaveURL(/#[a-z0-9-]+$/);

  // shortcuts sheet
  await page.locator("body").press("?");
  await expect(page.getByRole("dialog", { name: "Shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Shortcuts" })).toBeHidden();

  // Two-Mile Crib never embeds Street View
  await page.goto("./?nocoach#crib");
  await expect(card.locator("h2")).toHaveText(/Two-Mile Crib/i);
  await expect(card.locator("iframe")).toHaveCount(0);
  await expect(card.getByRole("link", { name: /Street View/ }).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("phone: no horizontal scroll, sheet resizes, Escape goes back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./?nocoach#fire");
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(scroll).toBeLessThanOrEqual(0);
  const panel = page.locator("#panel");
  await expect(panel).toHaveClass(/half/);
  await expect(page.locator("#card h2")).toHaveText("Great Chicago Fire");
  await page.locator(".handle").click();
  await expect(panel).toHaveClass(/full/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#list")).toBeVisible();
  const chips = await page.locator("#chips").evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(chips).toBe(true);
});
