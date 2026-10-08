import { expect, test, type Page } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI, fulfillSupabaseJson } from "../helpers/mock-auth";
import { TEST_USER_ID } from "../helpers/fixtures";

const committed = {
  id: "history-1",
  user_id: TEST_USER_ID,
  bank_account_id: "account-1",
  source_filename: "wyciag-wrzesien.csv",
  source_file_hash: "hash-1",
  detected_kind: "mbank",
  adapter_kind: "mbank",
  source_kind: "bank_statement",
  status: "committed",
  rows_total: 84,
  rows_committed: 76,
  rows_skipped: 0,
  rows_duplicate: 8,
  created_at: "2026-10-05T10:00:00Z",
  committed_at: "2026-10-05T10:05:00Z",
};
const rows = [
  {
    id: "history-row-1",
    session_id: committed.id,
    row_index: 1,
    posted_at: "2026-09-30",
    amount: 128.32,
    type: "expense",
    currency: "PLN",
    description: "PŁATNOŚĆ KARTĄ",
    counterparty: "LIDL POLSKA",
    external_id: null,
    raw_row_hash: "row-hash",
    is_hold: false,
    suggested_category_id: "cat-1",
    selected_category_id: "cat-1",
    selected_group_id: null,
    edited_description: null,
    decision: "import",
    duplicate_of: null,
    transaction_id: null,
    source_data: { columns: [{ label: "Odbiorca", value: "LIDL POLSKA SKLEP 1234 REDA" }] },
    created_at: "2026-10-05T10:00:00Z",
  },
];

async function mockHistory(page: Page, sessions: unknown[] = [committed], failRows = false) {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await page.route("**/rest/v1/transaction_import_sessions**", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("status")).toBe("eq.committed");
    expect(url.searchParams.get("user_id")).toBe(`eq.${TEST_USER_ID}`);
    return fulfillSupabaseJson(route, sessions);
  });
  await page.route("**/rest/v1/transaction_import_rows**", async (route) => {
    if (failRows) return route.fulfill({ status: 500, json: { message: "unavailable" } });
    expect(new URL(route.request().url()).searchParams.get("session_id")).toBe(
      `eq.${committed.id}`
    );
    return fulfillSupabaseJson(route, rows);
  });
}

test("history preserves commit counts and opens a read-only source statement", async ({ page }) => {
  await mockHistory(page);
  await page.goto("/import/history");
  await page.getByRole("button", { name: /wyciag-wrzesien.csv/ }).click();
  await expect(page.getByText("Dodano", { exact: true })).toBeVisible();
  await expect(page.locator("dd").filter({ hasText: /^76$/ })).toBeVisible();
  await expect(page.getByText(/Późniejsze zmiany transakcji/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Zobacz transakcje z tego okresu" })).toHaveAttribute(
    "href",
    "/transactions?startYear=2026&startMonth=9&endYear=2026&endMonth=9"
  );
  await expect(page.getByRole("button", { name: /Zatwierdź import/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Wróć do historii/ }).click();
  await expect(page.getByRole("button", { name: /wyciag-wrzesien.csv/ })).toBeVisible();
});

test("settings search exposes import history and explains an empty history", async ({ page }) => {
  await mockHistory(page, []);
  await page.goto("/settings");
  await page.getByRole("searchbox").fill("wyciąg");
  await page.getByRole("button", { name: /Historia importów/ }).click();
  await expect(page.getByText("Nie masz jeszcze zatwierdzonych importów.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Importuj wyciąg", exact: true })).toHaveAttribute(
    "href",
    "/import"
  );
});

test("failed source loading retains the historical import result", async ({ page }) => {
  await mockHistory(page, [committed], true);
  await page.goto("/import/history");
  await page.getByRole("button", { name: /wyciag-wrzesien.csv/ }).click();
  await expect(page.getByText("Nie udało się wczytać wyciągu.")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("dd").filter({ hasText: /^76$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Spróbuj ponownie" })).toBeVisible();
});
