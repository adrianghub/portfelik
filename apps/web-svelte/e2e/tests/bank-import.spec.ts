import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { injectFakeSession } from "../helpers/mock-auth";
import {
  MOCK_CATEGORIES,
  MOCK_PROFILE,
  MOCK_TRANSACTIONS,
  MOCK_USER,
  TEST_USER_ID,
} from "../helpers/fixtures";

const SUPABASE_URL = "https://emqzcygfwcvbmhxhfkcc.supabase.co";
const SUPABASE_URLS = [SUPABASE_URL, "http://127.0.0.1:54321", "http://localhost:54321"] as const;

const mbankSample = readFileSync(
  new URL("../../tests/import/fixtures/mbank/sample.csv", import.meta.url)
);

const mbankNoCounterpartySample = Buffer.from(
  `"mBank S.A."
"Historia operacji"
"Klient";"Jan Kowalski"
"Numer rachunku";"PL00 0000 0000 0000 0000 0000 0000"
""
#Data księgowania;#Data operacji;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji
2026-05-06;2026-05-06;"ZAKUP TOWARÓW I USŁUG";"KAWIARNIA TEST";"";"PL00 5555 5555 5555 5555 5555 5555";-24,00;9217,81
`,
  "utf8"
);

type ImportRow = {
  id: string;
  session_id: string;
  row_index: number;
  posted_at: string;
  amount: number;
  type: "income" | "expense";
  description: string;
  counterparty: string | null;
  currency: string;
  external_id: string | null;
  raw_row_hash: string;
  suggested_category_id: string | null;
  selected_category_id: string | null;
  selected_group_id: string | null;
  edited_description: string | null;
  decision: "pending" | "import" | "skip" | "duplicate";
  duplicate_of: string | null;
  transaction_id: string | null;
  created_at: string;
};

type ImportSession = {
  id: string;
  user_id: string;
  bank_account_id: string;
  source_filename: string | null;
  source_file_hash: string;
  detected_kind: "mbank" | "ing";
  status: "preview" | "committed" | "cancelled";
  rows_total: number;
  rows_committed: number;
  rows_skipped: number;
  rows_duplicate: number;
  created_at: string;
  committed_at: string | null;
};

type CategorizationRule = {
  id: string;
  user_id: string;
  kind: "exact" | "contains" | "type" | "composite";
  match_description: string | null;
  match_counterparty: string | null;
  match_type: "income" | "expense" | null;
  category_id: string;
  priority: number;
  created_at: string;
};

type BankImportMockOptions = {
  failRulesOnce?: boolean;
  failCategoriesOnce?: boolean;
  failRulePost?: boolean;
  defaultRules?: boolean;
};

async function mockBankImportAPI(page: Page, options = {}) {
  const opts = options as BankImportMockOptions;
  const account = {
    id: "bank-account-1",
    user_id: TEST_USER_ID,
    kind: "mbank",
    label: "mBank",
    currency: "PLN",
    archived_at: null,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  };
  const sessions: ImportSession[] = [];
  let rows: ImportRow[] = [];
  let rules: CategorizationRule[] =
    (opts.defaultRules ?? true)
      ? [
          {
            id: "rule-expense",
            user_id: TEST_USER_ID,
            kind: "type",
            match_description: null,
            match_counterparty: null,
            match_type: "expense",
            category_id: "cat-1",
            priority: 0,
            created_at: "2026-05-01T00:00:00Z",
          },
          {
            id: "rule-income",
            user_id: TEST_USER_ID,
            kind: "type",
            match_description: null,
            match_counterparty: null,
            match_type: "income",
            category_id: "cat-3",
            priority: 0,
            created_at: "2026-05-01T00:00:01Z",
          },
        ]
      : [];
  let failRulesOnce = opts.failRulesOnce ?? false;
  const failRulePost = opts.failRulePost ?? false;
  let failCategoriesOnce = opts.failCategoriesOnce ?? false;

  const normalize = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

  for (const url of SUPABASE_URLS) {
    await page.route(`${url}/auth/v1/**`, async (route) => {
      await route.fulfill({ status: 200, json: MOCK_USER });
    });
  }

  for (const supabaseUrl of SUPABASE_URLS)
    await page.route(`${supabaseUrl}/rest/v1/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const pathname = url.pathname;
      const method = request.method();

      if (pathname.endsWith("/profiles")) {
        return route.fulfill({ status: 200, json: [MOCK_PROFILE] });
      }

      if (pathname.endsWith("/categories")) {
        if (failCategoriesOnce) {
          failCategoriesOnce = false;
          return route.fulfill({ status: 500, json: { message: "temporary categories failure" } });
        }
        return route.fulfill({ status: 200, json: MOCK_CATEGORIES });
      }

      if (pathname.endsWith("/categorization_rules")) {
        if (failRulesOnce) {
          failRulesOnce = false;
          return route.fulfill({ status: 500, json: { message: "temporary rules failure" } });
        }
        if (method === "POST") {
          if (failRulePost) {
            return route.fulfill({ status: 500, json: { message: "rule save failed" } });
          }
          const body = request.postDataJSON() as Partial<CategorizationRule>;
          const duplicate = rules.some(
            (rule) =>
              rule.kind === body.kind &&
              normalize(rule.match_description) === normalize(body.match_description) &&
              normalize(rule.match_counterparty) === normalize(body.match_counterparty) &&
              (rule.match_type ?? null) === (body.match_type ?? null) &&
              rule.category_id === body.category_id
          );
          if (duplicate) {
            return route.fulfill({
              status: 409,
              json: { code: "23505", message: "duplicate key value violates unique constraint" },
            });
          }
          const created: CategorizationRule = {
            id: `rule-${rules.length + 1}`,
            user_id: TEST_USER_ID,
            kind: body.kind ?? "contains",
            match_description: body.match_description ?? null,
            match_counterparty: body.match_counterparty ?? null,
            match_type: body.match_type ?? null,
            category_id: body.category_id ?? "cat-1",
            priority: body.priority ?? 0,
            created_at: `2026-05-01T00:00:${String(rules.length + 2).padStart(2, "0")}Z`,
          };
          rules = [...rules, created];
          return route.fulfill({ status: 201, json: created });
        }

        if (method === "DELETE") {
          const id = url.searchParams.get("id")?.replace("eq.", "");
          rules = rules.filter((rule) => rule.id !== id);
          return route.fulfill({ status: 204, json: [] });
        }

        return route.fulfill({ status: 200, json: rules });
      }

      if (pathname.endsWith("/bank_accounts")) {
        if (method === "POST") return route.fulfill({ status: 201, json: account });
        return route.fulfill({ status: 200, json: [account] });
      }

      if (pathname.endsWith("/transaction_import_sessions")) {
        if (method === "POST") {
          const body = request.postDataJSON() as Partial<ImportSession>;
          const session: ImportSession = {
            id: `session-${sessions.length + 1}`,
            user_id: TEST_USER_ID,
            bank_account_id: body.bank_account_id ?? account.id,
            source_filename: body.source_filename ?? "wyciag.csv",
            source_file_hash: body.source_file_hash ?? "hash",
            detected_kind: "mbank",
            status: "preview",
            rows_total: 0,
            rows_committed: 0,
            rows_skipped: 0,
            rows_duplicate: 0,
            created_at: "2026-05-01T00:00:00Z",
            committed_at: null,
          };
          sessions.push(session);
          return route.fulfill({ status: 201, json: session });
        }

        if (method === "PATCH") {
          const id = url.searchParams.get("id")?.replace("eq.", "");
          const session = sessions.find((s) => s.id === id) ?? sessions.at(-1);
          Object.assign(session ?? {}, request.postDataJSON());
          return route.fulfill({ status: 200, json: session ? [session] : [] });
        }

        const bankAccountId = url.searchParams.get("bank_account_id")?.replace("eq.", "");
        const sourceFileHash = url.searchParams.get("source_file_hash")?.replace("eq.", "");
        const existing = sessions.find(
          (s) =>
            s.bank_account_id === bankAccountId &&
            s.source_file_hash === sourceFileHash &&
            s.status !== "cancelled"
        );
        return route.fulfill({ status: 200, json: existing ? [existing] : [] });
      }

      if (pathname.endsWith("/transaction_import_rows")) {
        if (method === "POST") {
          const body = request.postDataJSON() as Array<Partial<ImportRow>>;
          rows = body.map((row, index) => ({
            id: `row-${index}`,
            session_id: row.session_id ?? sessions.at(-1)?.id ?? "session-1",
            row_index: row.row_index ?? index,
            posted_at: row.posted_at ?? "2026-05-01",
            amount: row.amount ?? 0,
            type: row.type ?? "expense",
            description: row.description ?? "",
            counterparty: row.counterparty ?? null,
            currency: row.currency ?? "PLN",
            external_id: row.external_id ?? null,
            raw_row_hash: row.raw_row_hash ?? `raw-${index}`,
            suggested_category_id: row.suggested_category_id ?? null,
            selected_category_id: row.selected_category_id ?? null,
            selected_group_id: null,
            edited_description: null,
            decision: row.decision ?? "pending",
            duplicate_of: null,
            transaction_id: null,
            created_at: "2026-05-01T00:00:00Z",
          }));
          return route.fulfill({ status: 201, json: rows });
        }

        if (method === "PATCH") {
          const id = url.searchParams.get("id")?.replace("eq.", "");
          const patch = request.postDataJSON() as Partial<ImportRow>;
          rows = rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
          return route.fulfill({ status: 200, json: rows.filter((row) => row.id === id) });
        }

        const sessionId = url.searchParams.get("session_id")?.replace("eq.", "");
        return route.fulfill({
          status: 200,
          json: rows.filter((row) => row.session_id === sessionId),
        });
      }

      if (pathname.endsWith("/user_groups")) {
        return route.fulfill({ status: 200, json: [] });
      }

      if (pathname.endsWith("/transactions_with_category")) {
        return route.fulfill({ status: 200, json: MOCK_TRANSACTIONS });
      }

      return route.fulfill({ status: 200, json: [] });
    });

  for (const supabaseUrl of SUPABASE_URLS)
    await page.route(`${supabaseUrl}/rest/v1/rpc/**`, async (route) => {
      const url = route.request().url();
      if (url.includes("/rpc/preview_fingerprint_warnings")) {
        return route.fulfill({
          status: 200,
          json:
            rows.length > 0
              ? [
                  {
                    row_id: rows[0].id,
                    duplicate_of_transaction_id: "manual-duplicate-1",
                    duplicate_of_date: "2026-05-02",
                    duplicate_of_amount: 42.3,
                    duplicate_of_currency: "PLN",
                    duplicate_of_description: "Biedronka wpisana ręcznie",
                  },
                ]
              : [],
        });
      }
      if (url.includes("/rpc/commit_import_session")) {
        const session = sessions.at(-1);
        if (session) {
          session.status = "committed";
          session.rows_committed = rows.filter((row) => row.decision === "import").length;
          session.rows_skipped = rows.filter((row) => row.decision === "skip").length;
          session.rows_duplicate = 0;
          session.committed_at = "2026-05-06T00:00:00Z";
        }
        return route.fulfill({
          status: 200,
          json: {
            inserted: rows.filter((row) => row.decision === "import").length,
            duplicates_preview: 0,
            duplicates_commit: 0,
            skipped: rows.filter((row) => row.decision === "skip").length,
            fingerprint_warnings: [],
          },
        });
      }
      return route.fulfill({ status: 200, json: {} });
    });
}

/** Step 1 (duplikaty): keep auto-skipped duplicates, just advance. */
async function keepDuplicatesAndAdvance(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Dalej", exact: true }).click();
}

/** Step 1 (duplikaty): bring flagged rows back into review, then advance. */
async function restoreDuplicatesAndAdvance(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Przywróć wszystkie/ }).click();
  await page.getByRole("button", { name: "Dalej", exact: true }).click();
}

/** Step 2 → 3 (podsumowanie). */
async function advanceToFinalizeStep(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Dalej", exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await injectFakeSession(page);
  await mockBankImportAPI(page);
});

test("import wizard: renders heading, step pill and upload dropzone", async ({ page }) => {
  await page.goto("/transactions/import");

  // h1
  await expect(page.getByRole("heading", { name: "Import wyciągu bankowego" })).toBeVisible();

  // Step pill - two steps now (commit auto-redirects to transactions; no "done" step)
  await expect(page.getByText("Wgraj plik", { exact: true })).toBeVisible();
  await expect(page.getByText("Sprawdź pozycje", { exact: true })).toBeVisible();
  await expect(page.getByText("Duplikaty", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Zakończono", { exact: true })).toHaveCount(0);

  // Global breadcrumb trail back to transactions
  await expect(
    page
      .getByRole("navigation", { name: "Ścieżka nawigacji" })
      .getByRole("link", { name: "Transakcje" })
  ).toBeVisible();

  // Dropzone CTA
  await expect(page.getByText(/Upuść plik CSV tutaj/)).toBeVisible();
});

test("import wizard: invalid CSV surfaces unknown-kind error", async ({ page }) => {
  await page.goto("/transactions/import");

  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeAttached();

  // Junk content the bank detectors will fail to match.
  await fileInput.setInputFiles({
    name: "junk.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("not a real bank export\nfoo,bar,baz\n1,2,3\n", "utf8"),
  });

  // bank_upload_kind_unknown copy
  await expect(page.getByText(/Nie rozpoznano formatu/)).toBeVisible({
    timeout: 10_000,
  });
});

test("import wizard: selected file is retained as a chip and can be removed", async ({ page }) => {
  await page.goto("/transactions/import");

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("not a real bank export\nfoo,bar,baz\n1,2,3\n", "utf8"),
  });

  // The file persists on the upload panel as a chip with re-process + remove.
  await expect(page.getByText("wyciag.csv")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Przetwórz ponownie" })).toBeVisible();

  // Removing clears the chip.
  await page.getByRole("button", { name: "Usuń plik" }).click();
  await expect(page.getByText("wyciag.csv")).toHaveCount(0);
});

test("import wizard: uploads, flags probable duplicates, commits, and blocks re-import", async ({
  page,
}) => {
  await page.goto("/transactions/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankSample,
  });

  await expect(page.getByText(/Wykryto 1 możliwych duplikatów/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText("Możliwy duplikat")).toBeVisible();
  await expect(
    page.getByText(/Pasuje do: 2026-05-02 .* Biedronka wpisana ręcznie/)
  ).toBeVisible();

  await keepDuplicatesAndAdvance(page);

  await expect(page.getByRole("table").getByText("BIEDRONKA", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("table").getByText("WSPÓLNOTA MIESZKANIOWA", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("table").getByText("Możliwy duplikat")).toHaveCount(0);

  await page.getByRole("button", { name: /^Importuj gotowe/ }).click();
  await advanceToFinalizeStep(page);

  await expect(page.getByRole("heading", { name: "Potwierdź import" })).toBeVisible();
  await expect(page.getByText("Dodaj 3 · pomiń 0")).toBeVisible();
  await expect(page.getByText(/Pominięte jako duplikat/)).toBeVisible();
  await page.getByRole("button", { name: "Potwierdź (3)" }).click();

  await expect(page).toHaveURL(/\/transactions\?startYear=2026&startMonth=5/);

  await page.goto("/transactions/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankSample,
  });
  await expect(page.getByText("Ten plik został już zaimportowany")).toBeVisible({
    timeout: 10_000,
  });
});

test("import wizard: bookmark = one-tap save-as-rule with smart default text", async ({
  page,
}) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  // No prefill rules so the row needs a manually-saved rule (the affordance
  // under test); a default type rule would auto-categorize it instead.
  await mockBankImportAPI(page, { defaultRules: false });
  await page.goto("/transactions/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankNoCounterpartySample,
  });

  await restoreDuplicatesAndAdvance(page);

  const rawDescription = "ZAKUP TOWARÓW I USŁUG - KAWIARNIA TEST";
  const editedDescription = "Kawa po spotkaniu";

  const descriptionInput = page.getByRole("table").getByRole("textbox");
  await expect(descriptionInput).toHaveValue(rawDescription, { timeout: 10_000 });
  await descriptionInput.fill(editedDescription);
  await descriptionInput.blur();

  const combo = page.getByRole("table").getByRole("combobox", { name: "Kategoria" });
  await combo.click();
  await page.getByRole("option", { name: "Jedzenie", exact: true }).click();

  await page.getByRole("button", { name: "Zapisz regułę" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Reguła zapisana/)).toBeVisible({ timeout: 5_000 });
});

test("import wizard: explicit Importuj sends an uncategorized row to Inne", async ({ page }) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  // No prefill rules → the row stays uncategorized and must fall back to "Inne".
  await mockBankImportAPI(page, { defaultRules: false });
  await page.goto("/transactions/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankNoCounterpartySample,
  });

  await restoreDuplicatesAndAdvance(page);

  const decision = page.getByRole("table").getByRole("group");
  const importBtn = decision.getByRole("button", { name: "Importuj", exact: true });
  await expect(importBtn).toBeVisible({ timeout: 10_000 });
  await expect(decision.getByRole("button", { name: "Pomiń", exact: true })).toBeVisible();

  await importBtn.click();

  await advanceToFinalizeStep(page);
  await expect(page.getByRole("heading", { name: "Potwierdź import" })).toBeVisible();
  // Confirmation surfaces the uncategorized → "Inne" fallback explicitly.
  await expect(page.getByText(/trafi do „Inne”/)).toBeVisible();
  await expect(page.getByText("Dodaj 1 · pomiń 0")).toBeVisible();

  await page.getByRole("button", { name: "Potwierdź (1)" }).click();
  await expect(page).toHaveURL(/\/transactions/);
});

test("import wizard: failed required-rule save blocks the row from importing", async ({ page }) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  // No prefill rules, and rule POST fails - required-rule capture cannot succeed.
  await mockBankImportAPI(page, { defaultRules: false, failRulePost: true });
  await page.goto("/transactions/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankNoCounterpartySample,
  });

  await restoreDuplicatesAndAdvance(page);

  const combo = page.getByRole("table").getByRole("combobox", { name: "Kategoria" });
  await expect(combo).toBeVisible({ timeout: 10_000 });
  await combo.click();
  await page.getByRole("option", { name: "Jedzenie", exact: true }).click();

  const decision = page.getByRole("table").getByRole("group");
  const importBtn = decision.getByRole("button", { name: "Importuj", exact: true });
  await importBtn.click();

  // Rule save failed → the row must NOT be imported and commit stays blocked.
  await expect(importBtn).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Dalej", exact: true })).toBeDisabled();
});

test("import wizard: continues when rule prefill cannot load", async ({ page }) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  await mockBankImportAPI(page, { failRulesOnce: true });
  await page.goto("/transactions/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankSample,
  });

  await restoreDuplicatesAndAdvance(page);
  await expect(page.getByRole("table").getByText("BIEDRONKA", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: /^Importuj gotowe/ })).toHaveCount(0);
});

test("import wizard: continues when categories cannot load for optional prefill", async ({
  page,
}) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  await mockBankImportAPI(page, { failCategoriesOnce: true });
  await page.goto("/transactions/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankSample,
  });

  await restoreDuplicatesAndAdvance(page);
  await expect(page.getByRole("table").getByText("BIEDRONKA", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: /^Importuj gotowe/ })).toHaveCount(0);
});
