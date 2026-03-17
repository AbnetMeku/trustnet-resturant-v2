import { test, expect } from "@playwright/test";

const waiterPin = process.env.E2E_WAITER_PIN || "1001";
const stationPin = process.env.E2E_STATION_PIN || "1234";

async function enterPin(page, pin) {
  for (const digit of pin.split("")) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
}

test.describe("Waiter", () => {
  test("login and main tabs", async ({ page }) => {
    await page.goto("/waiter-login");
    await enterPin(page, waiterPin);

    await expect(page).toHaveURL(/\/waiter$/);
    await expect(page.getByText("Waiter", { exact: true })).toBeVisible();

    await page.getByTestId("waiter-tab-orders").click();
    await expect(page.getByTestId("waiter-new-order-card")).toBeVisible();
    await expect(page.getByTestId("waiter-active-order-card")).toBeVisible();

    await page.getByTestId("waiter-tab-history").click();
    await expect(page.locator("#history-date")).toBeVisible();

    await page.getByTestId("waiter-tab-tables").click();
    await expect(page.getByTestId("waiter-tables-view")).toBeVisible();

    await page.getByTestId("waiter-tab-prints").click();
    await expect(page.getByText("Today Failed Prints")).toBeVisible();
  });
});

test.describe("KDS", () => {
  test("login and history modal", async ({ page }) => {
    await page.goto("/station-login");
    await enterPin(page, stationPin);

    await expect(page).toHaveURL(/\/kds$/);
    await expect(page.getByText("KDS", { exact: true })).toBeVisible();

    await page.getByTestId("kds-tab-orders").click();
    await expect(page.getByTestId("kds-orders-root")).toBeVisible();

    await page.getByTestId("kds-tab-history").click();
    await expect(page.getByTestId("kds-history-waiter-filter")).toBeVisible();

    await page.getByTestId("kds-history-open-items").click();
    const modal = page.getByTestId("kds-history-modal");
    await expect(modal).toBeVisible();

    await page.getByTestId("kds-history-close-items").click();
    await expect(modal).toHaveCount(0);
  });
});
