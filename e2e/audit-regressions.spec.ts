import { expect, test } from "@playwright/test";
import { signIn, users } from "./fixtures";

test("Fantasy failure does not block logging, and profile errors can be retried", async ({ page }) => {
  await page.route("**/rest/v1/rpc/fantasy_feature_state", route => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await signIn(page, users.alex.email);
  await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
  await expect(page.locator(".global-notice")).toContainText("Fantasy is temporarily unavailable");
  await page.route("**/rest/v1/profiles?*", route => route.fulfill({ status: 503, headers: { "Retry-After": "0" }, json: { message: "Profile unavailable" } }));
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.unroute("**/rest/v1/profiles?*");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
});

test("own profile shows awards and a reachable account exit", async ({ page }, testInfo) => {
  await signIn(page, users.alex.email);
  await page.getByRole("button", { name: "Profile", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Your badges" })).toBeVisible();
  await expect(page.locator(".badge-history li").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("profile-fixed.png") });
  await page.getByRole("button", { name: "Sign out" }).last().click();
  await expect(page.getByLabel("Company email")).toBeVisible();
});

test("a committed vote survives a failed ranking refresh and blocks double clicks", async ({ page }) => {
  await signIn(page, users.jordan.email);
  const vote = page.getByRole("button", { name: /^Upvote / }).first();
  await expect(vote).toBeVisible();
  const label = await vote.getAttribute("aria-label");
  const rowIndex = await page.locator(".activity-row").evaluateAll(rows => rows.findIndex(row => row.querySelector("button.upvote-button")?.getAttribute("aria-label")?.startsWith("Upvote ")));
  const row = page.locator(".activity-row").nth(rowIndex);
  await page.route("**/rest/v1/rpc/snack_leaderboard", route => route.fulfill({ status: 503, json: { message: "Rankings unavailable" } }));
  await page.route("**/rest/v1/log_upvotes", async route => {
    await new Promise(resolve => setTimeout(resolve, 400));
    await route.continue();
  });
  await vote.click();
  await expect(row.locator(".upvote-button")).toBeDisabled();
  await expect(page.locator(".global-notice")).toContainText("Your vote was saved");
  await expect(row.locator(".upvote-button")).toHaveAttribute("aria-pressed", "true");
  await page.unroute("**/rest/v1/rpc/snack_leaderboard");
  await page.reload();
  await expect(page.getByRole("button", { name: label!.replace("Upvote ", "Remove upvote from "), exact: true }).first()).toHaveAttribute("aria-pressed", "true");
});

test("league refresh, safe switching, and saved queue editing work for existing members", async ({ page }, testInfo) => {
  const first = "a1000000-0000-0000-0000-000000000001";
  const second = "a1000000-0000-0000-0000-000000000002";
  const queued = { id: "a2000000-0000-0000-0000-000000000001", name: "Queued Apple", category: "Fruit" };
  let preferences = [queued];
  let memberCount = 4;
  const overviewCalls: string[] = [];
  const savedQueues: unknown[] = [];
  await page.route("**/rest/v1/rpc/my_fantasy_leagues", route => route.fulfill({ json: [
    { league_id: first, name: "First league", join_code: "FIRST", member_count: memberCount, is_creator: true },
    { league_id: second, name: "Second league", join_code: "SECOND", member_count: 4, is_creator: true },
  ] }));
  await page.route("**/rest/v1/rpc/fantasy_overview", async route => {
    const id = route.request().postDataJSON().p_league_id as string;
    overviewCalls.push(id);
    if (id === second) await new Promise(resolve => setTimeout(resolve, 600));
    await route.fulfill({ json: {
      league: { id, name: id === first ? "First league" : "Second league", join_code: "CODE" },
      members: [{ user_id: users.alex.id, display_name: "Alex Morgan" }],
      season: { id, season_number: 1, status: "drafting", current_pick: 1, pick_deadline: "2026-09-08T17:00:00Z" },
      draftOrder: [{ user_id: users.alex.id, position: 1 }], picks: [], roster: [], standings: [], archive: [],
      preferences: id === first ? preferences : [],
    } });
  });
  await page.route("**/rest/v1/rpc/set_fantasy_preferences", route => {
    const payload = route.request().postDataJSON();
    savedQueues.push(payload);
    preferences = [];
    return route.fulfill({ json: null });
  });
  await signIn(page, users.alex.email);
  await page.getByRole("button", { name: "Fantasy", exact: true }).first().click();
  await expect(page.locator(".preference-queue")).toContainText("Queued Apple");
  await page.getByRole("button", { name: "Create or join a league" }).click();
  await expect(page.getByRole("button", { name: "Create league", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join league", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("fantasy-fixed.png") });
  await page.getByRole("button", { name: "Close league forms" }).click();
  memberCount = 5;
  const before = overviewCalls.length;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => overviewCalls.length).toBeGreaterThan(before);
  await expect(page.locator(".league-switcher")).toContainText("5/8 managers");
  await page.locator(".preference-queue").getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Save queue" }).click();
  await expect(page.getByRole("status")).toContainText("Queue saved");
  expect(savedQueues.at(-1)).toEqual({ p_season_id: first, p_snack_ids: [] });
  await page.reload();
  await expect(page.locator(".preference-queue")).toContainText("No snacks queued");
  await page.locator(".league-switcher select").selectOption(second);
  await expect(page.getByText("Loading selected league…")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save queue" })).toHaveCount(0);
  await expect(page.locator(".draft-status")).toBeVisible();
  await page.getByRole("button", { name: "Save queue" }).click();
  await expect.poll(() => savedQueues.length).toBe(2);
  expect(savedQueues.at(-1)).toEqual({ p_season_id: second, p_snack_ids: [] });
});
