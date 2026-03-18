import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

test("Pages shell renders the Worker greeting", async ({ page }) => {
  await page.route("**/api/hello**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        service: "cf-boilerplate",
        subject: "Cloudflare",
        message: "Hello, Cloudflare!",
        visits: 1,
        source: "d1",
      }),
    });
  });

  const html = await fs.readFile(path.resolve("pages/index.html"), "utf8");
  const hydratedHtml = html.replace(
    'data-api-base-url="/api"',
    'data-api-base-url="https://example.com/api"',
  );

  await page.setContent(hydratedHtml);

  await expect(
    page.getByRole("heading", { name: "Hello from Cloudflare" }),
  ).toBeVisible();
  await expect(page.getByText("Hello, Cloudflare!")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload greeting" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save R2 note" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send queue job" })).toBeVisible();
});
