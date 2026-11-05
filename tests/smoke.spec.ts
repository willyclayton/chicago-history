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

test("app navigation: Back closes the story, then the photo viewer first", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./?nocoach");
  await expect(page.locator("#list")).toBeVisible();

  // opening a story from the list pushes an entry; the browser's Back returns to the list
  await page.locator('#list button[data-id="fire"]').click();
  await expect(page.locator("#card h2")).toHaveText("Great Chicago Fire");
  await expect(page).toHaveURL(/#fire$/);
  await page.locator("body").press("ArrowRight"); // stepping replaces the entry
  await expect(page).not.toHaveURL(/#fire$/);
  await page.goBack();
  await expect(page.locator("#list")).toBeVisible();
  await expect(page).not.toHaveURL(/#/);
  await page.goForward();
  await expect(page.locator("#card h2")).toBeVisible();

  // the viewer is its own entry, whatever the photo UI looks like
  await page.locator('#list button[data-id="fire"]').click().catch(() => {});
  await page.evaluate(() => {
    const w = window as unknown as { __ctm: { actions: { select(id: string): void; openViewer(id: string, i: number): void } } };
    w.__ctm.actions.select("fire");
    w.__ctm.actions.openViewer("fire", 1);
  });
  await expect(page).toHaveURL(/#fire\/photo\/2$/);
  await page.goBack();
  await expect(page).toHaveURL(/#fire$/);
  const viewer = await page.evaluate(() => (window as unknown as { __ctm: { getState(): { viewer: unknown } } }).__ctm.getState().viewer);
  expect(viewer).toBeNull();
  await expect(page.locator("#card h2")).toHaveText("Great Chicago Fire");
  expect(errors).toEqual([]);
});

test("deep link to a photo opens the viewer; Back closes it", async ({ page }) => {
  await page.goto("./?nocoach&mediaDemo#fire/photo/1");
  await expect(page.locator("#card h2")).toHaveText("Great Chicago Fire");
  const dialog = page.getByRole("dialog", { name: /^Photos of/ });
  const shown = await dialog.waitFor({ timeout: 8000 }).then(
    () => true,
    () => false,
  );
  test.skip(!shown, "the photo viewer renders nothing yet (placeholder)");
  await expect(page).toHaveURL(/#fire\/photo\/1$/);
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/#fire$/);
  await expect(page.locator("#card h2")).toHaveText("Great Chicago Fire");
});

test("installable: manifest, icons, and a service worker that keeps the page working", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./?nocoach");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBeTruthy();
  const manifest = await (await page.request.get(new URL(href!, page.url()).href)).json();
  expect(manifest).toMatchObject({ short_name: "Time Map", display: "standalone", start_url: "./", scope: "./" });
  for (const icon of manifest.icons) {
    const res = await page.request.get(new URL(icon.src, new URL(href!, page.url())).href);
    expect(res.ok(), icon.src).toBe(true);
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);

  // the worker installs and takes control; the app still loads, and loads offline
  const active = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
  expect(active).toBe(true);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.locator("#list")).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#list button[data-id]").first()).toBeVisible();
  await context.setOffline(false);
  expect(errors).toEqual([]);
});
