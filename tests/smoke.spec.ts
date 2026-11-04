import { expect, test } from "@playwright/test";

test("loads, filters by year, opens a deep link and steps", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("./#valentine");
  const card = page.locator("#card");
  await expect(card.locator("h2")).toHaveText("St. Valentine's Day Massacre");
  await expect(page.locator("#yearOut")).toHaveText(/^\d{4}$/);

  // map chunk loads and the site layers are added
  await page.waitForFunction(() => {
    const m = (window as unknown as { __map?: { getLayer(id: string): unknown } }).__map;
    return !!m && !!m.getLayer("sites");
  });

  // slider at 1850
  const slider = page.locator("#year");
  await slider.fill("1850");
  await expect(page.locator("#countOut")).toHaveText("5 of 67 sites by 1850");
  await expect(page.locator(".mklist button")).toHaveCount(5);

  // search
  await page.locator("#q").fill("capone");
  await expect(page.locator("#list button[data-id]")).toHaveCount(2);
  await page.locator("#q").fill("");

  // keyboard stepping from a list row
  await page.locator('#list button[data-id="fire"]').click();
  await expect(page.locator("#yearOut")).toHaveText("1871");
  await page.locator("body").press("ArrowRight");
  await expect(page.locator("#yearOut")).not.toHaveText("1871");
  await expect(page).toHaveURL(/#[a-z0-9-]+$/);

  // Two-Mile Crib never embeds Street View
  await page.goto("./#crib");
  await expect(card.locator("h2")).toHaveText(/Two-Mile Crib/i);
  await expect(card.locator("iframe")).toHaveCount(0);
  await expect(card.getByRole("link", { name: /Street View/ })).toBeVisible();

  expect(errors).toEqual([]);
});

test("phone layout: no horizontal scroll, sheet expands and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#fire");
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(scroll).toBeLessThanOrEqual(0);
  const card = page.locator("#card");
  await expect(card.locator(".body")).toBeHidden();
  await card.getByRole("button", { name: "Read story" }).click();
  await expect(card.locator(".body")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  const chips = await page.locator("#chips").evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(chips).toBe(true);
});
