import { test, expect } from "@playwright/test";

const adminUser = process.env.E2E_ADMIN_USERNAME || "admin_demo";
const adminPass = process.env.E2E_ADMIN_PASSWORD || "admin123";

async function openSidebarIfNeeded(page) {
  const toggle = page.getByLabel("Open sidebar");
  if (await toggle.isVisible()) {
    await toggle.click();
  }
}

async function clickNav(page, testId) {
  await openSidebarIfNeeded(page);
  const item = page.getByTestId(testId);
  await item.scrollIntoViewIfNeeded();
  await item.click();
}

test.describe("Admin", () => {
  test("login and core panels", async ({ page }) => {
    await page.goto("/login");

    await page.getByTestId("login-username").fill(adminUser);
    await page.getByTestId("login-password").fill(adminPass);
    await page.getByTestId("login-submit").click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-panel-overview")).toBeVisible();

    await clickNav(page, "admin-nav-users");
    await expect(page.getByTestId("admin-panel-users")).toBeVisible();

    await clickNav(page, "admin-nav-tables");
    await expect(page.getByTestId("admin-panel-tables")).toBeVisible();

    await clickNav(page, "admin-nav-menu");
    await expect(page.getByTestId("admin-panel-menu")).toBeVisible();

    await clickNav(page, "admin-nav-stations");
    await expect(page.getByTestId("admin-panel-stations")).toBeVisible();

    await clickNav(page, "admin-nav-order");
    await expect(page.getByTestId("admin-panel-order")).toBeVisible();

    await clickNav(page, "admin-nav-reports");
    await expect(page.getByTestId("admin-panel-reports")).toBeVisible();

    await clickNav(page, "admin-nav-waiter-summary");
    await expect(page.getByTestId("admin-panel-waiter-summary")).toBeVisible();

    await clickNav(page, "admin-nav-print");
    await expect(page.getByTestId("admin-panel-print")).toBeVisible();

    await clickNav(page, "admin-nav-settings");
    await expect(page.getByTestId("settings-tab-operations")).toBeVisible();

    await page.getByTestId("settings-tab-operations").click();
    await expect(page.getByTestId("settings-content-operations")).toBeVisible();

    await page.getByTestId("settings-tab-license").click();
    await expect(page.getByTestId("settings-content-license")).toBeVisible();
  });
});
