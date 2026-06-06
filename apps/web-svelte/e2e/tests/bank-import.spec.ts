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

const ersteSample = readFileSync(
  new URL("../../tests/import/fixtures/erste/historia.csv", import.meta.url)
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

const mbankRepeatedMerchantSample = Buffer.from(
  `"mBank S.A."
"Historia operacji"
"Klient";"Jan Kowalski"
"Numer rachunku";"PL00 0000 0000 0000 0000 0000 0000"
""
#Data księgowania;#Data operacji;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji
2026-05-02;2026-05-02;"ZAKUP TOWARÓW I USŁUG";"BIEDRONKA 4521 WARSZAWA";"BIEDRONKA";"PL00 1111 1111 1111 1111 1111 1111";-42,30;1957,70
2026-05-03;2026-05-03;"ZAKUP TOWARÓW I USŁUG";"BIEDRONKA 8123 WARSZAWA";"BIEDRONKA";"PL00 2222 2222 2222 2222 2222 2222";-31,20;1926,50
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

type ImportAdapterKind =
  | "mbank"
  | "ing"
  | "pko_bp"
  | "pekao"
  | "erste"
  | "millennium"
  | "alior"
  | "bnp_paribas"
  | "citi_handlowy";

type BankAccount = {
  id: string;
  user_id: string;
  kind: ImportAdapterKind;
  label: string;
  currency: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type ImportSession = {
  id: string;
  user_id: string;
  bank_account_id: string;
  source_filename: string | null;
  source_file_hash: string;
  detected_kind: ImportAdapterKind;
  adapter_kind: ImportAdapterKind | null;
  source_kind: "bank_statement" | "portfelik_export";
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
  match_day_of_month?: number | null;
  category_id: string;
  priority: number;
  created_at: string;
};

type BankImportMockOptions = {
  failRulesOnce?: boolean;
  failCategoriesOnce?: boolean;
  failRulePost?: boolean;
  defaultRules?: boolean;
  autoSkipFirstAsDuplicate?: boolean;
  failMarkDuplicatesOnce?: boolean;
};

async function mockBankImportAPI(page: Page, options = {}) {
  const opts = options as BankImportMockOptions;
  let accounts: BankAccount[] = [
    {
      id: "bank-account-1",
      user_id: TEST_USER_ID,
      kind: "mbank",
      label: "mBank",
      currency: "PLN",
      archived_at: null,
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-01T00:00:00Z",
    },
  ];
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
  const autoSkipFirstAsDuplicate = opts.autoSkipFirstAsDuplicate ?? false;
  let failMarkDuplicatesOnce = opts.failMarkDuplicatesOnce ?? false;

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

        if (method === "PATCH") {
          const id = url.searchParams.get("id")?.replace("eq.", "");
          const patch = request.postDataJSON() as Partial<CategorizationRule>;
          const current = rules.find((rule) => rule.id === id);
          if (!current) return route.fulfill({ status: 404, json: { message: "not found" } });
          const updated = { ...current, ...patch };
          rules = rules.map((rule) => (rule.id === id ? updated : rule));
          return route.fulfill({ status: 200, json: updated });
        }

        if (method === "DELETE") {
          const id = url.searchParams.get("id")?.replace("eq.", "");
          rules = rules.filter((rule) => rule.id !== id);
          return route.fulfill({ status: 204, json: [] });
        }

        return route.fulfill({ status: 200, json: rules });
      }

      if (pathname.endsWith("/bank_accounts")) {
        const kind = url.searchParams.get("kind")?.replace("eq.", "") as
          | ImportAdapterKind
          | undefined;
        if (method === "POST") {
          const body = request.postDataJSON() as Partial<BankAccount>;
          const account: BankAccount = {
            id: `bank-account-${accounts.length + 1}`,
            user_id: TEST_USER_ID,
            kind: body.kind ?? "mbank",
            label: body.label ?? body.kind ?? "mBank",
            currency: body.currency ?? "PLN",
            archived_at: null,
            created_at: "2026-05-01T00:00:00Z",
            updated_at: "2026-05-01T00:00:00Z",
          };
          accounts = [...accounts, account];
          return route.fulfill({ status: 201, json: account });
        }
        return route.fulfill({
          status: 200,
          json: kind ? accounts.filter((account) => account.kind === kind) : accounts,
        });
      }

      if (pathname.endsWith("/transaction_import_sessions")) {
        if (method === "POST") {
          const body = request.postDataJSON() as Partial<ImportSession>;
          const session: ImportSession = {
            id: `session-${sessions.length + 1}`,
            user_id: TEST_USER_ID,
            bank_account_id: body.bank_account_id ?? accounts[0].id,
            source_filename: body.source_filename ?? "wyciag.csv",
            source_file_hash: body.source_file_hash ?? "hash",
            detected_kind: body.detected_kind ?? body.adapter_kind ?? "mbank",
            adapter_kind: body.adapter_kind ?? body.detected_kind ?? "mbank",
            source_kind: body.source_kind ?? "bank_statement",
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

        const statusParam = url.searchParams.get("status")?.replace("eq.", "");
        if (statusParam === "preview" && !url.searchParams.get("source_file_hash")) {
          // fetchActivePreviewSession: latest still-open preview draft (resume entry point).
          const preview = [...sessions].reverse().find((sess) => sess.status === "preview");
          return route.fulfill({ status: 200, json: preview ? [preview] : [] });
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
            decision: row.decision ?? "import",
            duplicate_of: null,
            transaction_id: null,
            created_at: "2026-05-01T00:00:00Z",
          }));
          if (autoSkipFirstAsDuplicate && rows.length > 0) {
            rows[0] = {
              ...rows[0],
              decision: "duplicate",
              duplicate_of: "manual-duplicate-1",
            };
          }
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
      if (url.includes("/rpc/mark_preview_duplicates")) {
        if (failMarkDuplicatesOnce) {
          failMarkDuplicatesOnce = false;
          return route.fulfill({ status: 500, json: { message: "scan failed" } });
        }
        return route.fulfill({ status: 200, json: [] });
      }
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

test.beforeEach(async ({ page }) => {
  await injectFakeSession(page);
  await mockBankImportAPI(page);
});

test("import wizard: renders heading, step pill and upload dropzone", async ({ page }) => {
  await page.goto("/import");

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
  await page.goto("/import");

  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeAttached();

  // Junk content the bank detectors will fail to match.
  await fileInput.setInputFiles({
    name: "junk.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("not a real bank export\nfoo,bar,baz\n1,2,3\n", "utf8"),
  });

  await expect(page.getByText(/Nie rozpoznano formatu/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByLabel("Typ pliku")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kontynuuj" })).toBeDisabled();
});

test("import wizard: wrong manual adapter keeps selector available", async ({ page }) => {
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "junk.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("not a real bank export\nfoo,bar,baz\n1,2,3\n", "utf8"),
  });

  await page.getByLabel("Typ pliku").selectOption({ label: "mBank" });
  await page.getByRole("button", { name: "Kontynuuj" }).click();

  await expect(page.getByText("Nie udało się odczytać pliku jako mBank.")).toBeVisible();
  await expect(page.getByLabel("Typ pliku")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("import wizard: confirms medium-confidence Erste adapter", async ({ page }) => {
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "historia.csv",
    mimeType: "text/csv",
    buffer: ersteSample,
  });

  await expect(page.getByText("Prawdopodobnie: Erste Bank Polska (dawniej Santander)")).toBeVisible(
    {
      timeout: 10_000,
    }
  );
  await expect(page.getByLabel("Typ pliku")).toHaveValue("erste");
  await page.getByRole("button", { name: "Kontynuuj" }).click();

  await expect(page.getByRole("table").getByText("LIDL SP Z OO", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
});

test("import wizard: medium-confidence detection is overrideable before parse", async ({
  page,
}) => {
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "historia.csv",
    mimeType: "text/csv",
    buffer: ersteSample,
  });

  await expect(page.getByLabel("Typ pliku")).toHaveValue("erste", { timeout: 10_000 });
  await page.getByLabel("Typ pliku").selectOption({ label: "mBank" });
  await page.getByRole("button", { name: "Kontynuuj" }).click();

  await expect(page.getByText("Nie udało się odczytać pliku jako mBank.")).toBeVisible();
  await expect(page.getByLabel("Typ pliku")).toHaveValue("mbank");
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("import wizard: selected file is retained as a chip and can be removed", async ({ page }) => {
  await page.goto("/import");

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("not a real bank export\nfoo,bar,baz\n1,2,3\n", "utf8"),
  });

  // The file persists on the upload panel as a removable chip. Re-process is
  // only offered when returning from review, not during fresh adapter selection.
  await expect(page.getByText("wyciag.csv")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Usuń plik" })).toBeVisible();

  // Removing clears the chip.
  await page.getByRole("button", { name: "Usuń plik" }).click();
  await expect(page.getByText("wyciag.csv")).toHaveCount(0);
});

test("import wizard: uploads, flags probable duplicates, commits, and blocks re-import", async ({
  page,
}) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  await mockBankImportAPI(page, { autoSkipFirstAsDuplicate: true });
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankSample,
  });

  await expect(page.getByRole("button", { name: /Przywróć wszystkie do decyzji/ })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: "Pokaż", exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByText("BIEDRONKA", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("table").getByText("WSPÓLNOTA MIESZKANIOWA", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Zaimportuj 3 transakc/ })).toBeEnabled();

  await page.getByRole("button", { name: /^Zaimportuj \d+ transakc/ }).click();

  await expect(page.getByRole("heading", { name: "Potwierdź import" })).toBeVisible();
  await expect(page.getByText("Dodaj 3 · pomiń 0")).toBeVisible();
  await expect(page.getByText(/Pominięte jako duplikat/)).toBeVisible();
  await page.getByRole("button", { name: "Potwierdź (3)" }).click();

  await expect(page).toHaveURL(/\/transactions\?startYear=2026&startMonth=5/);

  await page.goto("/import");
  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankSample,
  });
  await expect(page.getByText("Ten plik został już zaimportowany")).toBeVisible({
    timeout: 10_000,
  });
});

test("import wizard: commits a fully-categorized statement in one click (no per-row decisions)", async ({
  page,
}) => {
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankSample,
  });

  const sortSelect = page.getByLabel("Sortowanie pozycji importu");
  await expect(sortSelect).toHaveValue("original", { timeout: 10_000 });
  await sortSelect.selectOption("amount_asc");
  await expect(sortSelect).toHaveValue("amount_asc");
  await expect(page.getByText("Reguła: Typ: Wydatek").first()).toBeVisible();

  await expect(page.getByRole("button", { name: /^Zaimportuj \d+ transakc/ })).toBeEnabled();
  await page.getByRole("button", { name: /^Zaimportuj \d+ transakc/ }).click();
  await expect(page.getByRole("heading", { name: "Potwierdź import" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/transactions\?startYear=2026&startMonth=5/);
});

test("import wizard: auto-learns a rule after manual category choice", async ({ page }) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  // No prefill rules so a manual pick triggers automatic rule learning.
  await mockBankImportAPI(page, { defaultRules: false });
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankNoCounterpartySample,
  });

  const rawDescription = "ZAKUP TOWARÓW I USŁUG - KAWIARNIA TEST";
  const editedDescription = "Kawa po spotkaniu";

  const descriptionInput = page.getByRole("table").getByRole("textbox");
  await expect(descriptionInput).toHaveValue(rawDescription, { timeout: 10_000 });
  await descriptionInput.fill(editedDescription);
  await descriptionInput.blur();

  const combo = page.getByRole("table").getByRole("combobox", { name: "Kategoria" });
  await combo.click();
  await page.getByRole("option", { name: "Jedzenie", exact: true }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Reguła zapisana/)).toBeVisible({ timeout: 5_000 });
});

test("import wizard: changing a rule-backed category updates matching rows", async ({ page }) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  await mockBankImportAPI(page, { defaultRules: false });
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankRepeatedMerchantSample,
  });

  const biedronkaRows = page.getByRole("table").getByRole("row").filter({ hasText: "BIEDRONKA" });
  await expect(biedronkaRows).toHaveCount(2, { timeout: 10_000 });

  await biedronkaRows.nth(0).getByRole("combobox", { name: "Kategoria" }).click();
  await page.getByRole("option", { name: "Jedzenie", exact: true }).click();

  await expect(page.getByText("Reguła: BIEDRONKA").first()).toBeVisible({ timeout: 5_000 });
  await expect(
    biedronkaRows.nth(1).getByRole("button", { name: "Wyczyść kategorię" })
  ).toContainText("Jedzenie");

  await biedronkaRows.nth(0).getByRole("button", { name: "Wyczyść kategorię" }).click();
  await biedronkaRows.nth(0).getByRole("combobox", { name: "Kategoria" }).click();
  await page.getByRole("option", { name: "Transport", exact: true }).click();

  await expect(
    biedronkaRows.nth(0).getByRole("button", { name: "Wyczyść kategorię" })
  ).toContainText("Transport");
  await expect(
    biedronkaRows.nth(1).getByRole("button", { name: "Wyczyść kategorię" })
  ).toContainText("Transport");
});

test("import wizard: uncategorized importing row goes to Inne", async ({ page }) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  // No prefill rules → the row stays uncategorized and must fall back to "Inne".
  await mockBankImportAPI(page, { defaultRules: false });
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankNoCounterpartySample,
  });
  const restoreAllDuplicates = page.getByRole("button", {
    name: /Przywróć wszystkie do decyzji/,
  });
  if (await restoreAllDuplicates.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await restoreAllDuplicates.click();
  }

  const rowToggle = page.getByRole("table").getByRole("button", { name: "Importuj" });
  await expect(rowToggle).toBeVisible({ timeout: 10_000 });
  await rowToggle.click();
  await expect(rowToggle).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^Zaimportuj \d+ transakc/ }).click();
  await expect(page.getByRole("heading", { name: "Potwierdź import" })).toBeVisible();
  // Confirmation surfaces the uncategorized → "Inne" fallback explicitly.
  await expect(page.getByText(/Trafią do „Inne” \(1\)/)).toBeVisible();
  await expect(page.getByText("Dodaj 1 · pomiń 0")).toBeVisible();

  await page.getByRole("button", { name: "Potwierdź (1)" }).click();
  await expect(page).toHaveURL(/\/transactions/);
});

test("import wizard: continues when rule prefill cannot load", async ({ page }) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  await mockBankImportAPI(page, { failRulesOnce: true });
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankSample,
  });
  await expect(page.getByRole("table").getByText("BIEDRONKA", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: /^Zaimportuj \d+ transakc/ })).toBeEnabled();
});

test("import wizard: continues when categories cannot load for optional prefill", async ({
  page,
}) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  await mockBankImportAPI(page, { failCategoriesOnce: true });
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankSample,
  });
  await expect(page.getByRole("table").getByText("BIEDRONKA", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: /^Zaimportuj \d+ transakc/ })).toBeEnabled();
});

test("import wizard: bulk-marks restored rows as import", async ({ page }) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  await mockBankImportAPI(page, { autoSkipFirstAsDuplicate: true });
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankSample,
  });

  // Under the default-import model rows arrive as "import"; the only way a row reaches
  // the pending ("Do decyzji") bucket is an explicit user action. Restoring the
  // auto-flagged duplicate sends it back to pending so we can exercise the bulk control.
  const restoreAll = page.getByRole("button", { name: /Przywróć wszystkie do decyzji/ });
  await expect(restoreAll).toBeVisible({ timeout: 10_000 });
  await restoreAll.click();

  // The bulk "mark visible as import" control only appears when visible rows are pending.
  const bulkImport = page.getByRole("button", { name: /Oznacz widoczne jako import/ });
  await expect(bulkImport).toBeVisible();
  await bulkImport.click();
  await expect(bulkImport).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Zaimportuj \d+ transakc/ })).toBeEnabled();
});

function makeLargeMbankCsv(n: number): Buffer {
  const header =
    '"mBank S.A."\n"Historia operacji"\n"Klient";"Jan Kowalski"\n"Numer rachunku";"PL00 0000 0000 0000 0000 0000 0000"\n""\n#Data księgowania;#Data operacji;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji\n';
  let rows = "";
  for (let i = 0; i < n; i++) {
    rows += `2026-05-01;2026-05-01;"ZAKUP TOWARÓW I USŁUG";"ZAKUP ${i}";"MERCHANT ${i}";"PL00 9999 9999 9999 9999 9999 9999";-${i + 1},00;1000,00\n`;
  }
  return Buffer.from(header + rows, "utf8");
}

test("import wizard: large import virtualizes the review list and keeps every row", async ({
  page,
}) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  await mockBankImportAPI(page);
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "duzy-wyciag.csv",
    mimeType: "text/csv",
    buffer: makeLargeMbankCsv(500),
  });

  // The full set is tracked even though only a window is painted (no lost rows in data).
  const commit = page.getByRole("button", { name: /^Zaimportuj 500 transakc/ });
  await expect(commit).toBeEnabled({ timeout: 15_000 });

  // Windowing is active: far fewer than 500 rows are in the DOM on first paint.
  const tableRows = page.locator("table tbody tr");
  expect(await tableRows.count()).toBeLessThan(200);

  // The last row is not painted yet; scrolling appends chunks until it appears
  // (guards against blank-window / lost-row regressions).
  const lastRow = page.getByRole("table").getByText("MERCHANT 499", { exact: true });
  await expect(lastRow).toHaveCount(0);
  for (let i = 0; i < 40 && (await lastRow.count()) === 0; i++) {
    // Scroll the sentinel (last tbody row) into view; works whether the page or an
    // inner shell container scrolls, unlike window.scrollTo.
    await page
      .locator("table tbody tr")
      .last()
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await page.waitForTimeout(80);
  }
  await expect(lastRow).toBeVisible();
});

const mbankZeroAmountSample = Buffer.from(
  `"mBank S.A."
"Historia operacji"
"Klient";"Jan Kowalski"
"Numer rachunku";"PL00 0000 0000 0000 0000 0000 0000"
""
#Data księgowania;#Data operacji;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji
2026-05-04;2026-05-04;"ZAKUP TOWARÓW I USŁUG";"BLOKADA";"AUTORYZACJA";"PL00 5555 5555 5555 5555 5555 5555";0,00;1000,00
2026-05-05;2026-05-05;"ZAKUP TOWARÓW I USŁUG";"ZAKUPY";"BIEDRONKA";"PL00 5555 5555 5555 5555 5555 5555";-15,00;985,00
`,
  "utf8"
);

test("import wizard: zero-amount rows are dropped and surfaced as skipped", async ({ page }) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  await mockBankImportAPI(page);
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankZeroAmountSample,
  });

  // The 0,00 authorisation hold is dropped at normalize() and surfaced as skipped.
  await expect(page.getByText(/1 pozycji bez kwoty pominięto/)).toBeVisible({ timeout: 10_000 });
  // The real transaction still imports.
  await expect(page.getByRole("table").getByText("BIEDRONKA", { exact: true })).toBeVisible();
});

test("import wizard: resumes an unsaved draft after reload", async ({ page }) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  await mockBankImportAPI(page);
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankSample,
  });
  await expect(page.getByRole("button", { name: /^Zaimportuj \d+ transakc/ })).toBeEnabled({
    timeout: 10_000,
  });

  // The draft session persists server-side; after a reload the resume card offers it back.
  await page.reload();
  await expect(page.getByText(/Niezapisany import/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Wznów import/ }).click();
  await expect(page.getByRole("button", { name: /^Zaimportuj \d+ transakc/ })).toBeEnabled();
});

test("import wizard: leave guard discards the draft on navigate-away", async ({ page }) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  await mockBankImportAPI(page);
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankSample,
  });
  await expect(page.getByRole("button", { name: /^Zaimportuj \d+ transakc/ })).toBeEnabled({
    timeout: 10_000,
  });

  // Client-side navigation mid-review triggers the unsaved-changes guard.
  await page.locator('a[href="/dashboard"]').first().click();
  await expect(page.getByText(/Zapisać zmiany przed wyjściem/)).toBeVisible();
  await page.getByRole("button", { name: "Odrzuć", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("import wizard: warns when the duplicate pre-scan fails", async ({ page }) => {
  await page.unrouteAll();
  await injectFakeSession(page);
  await mockBankImportAPI(page, { failMarkDuplicatesOnce: true });
  await page.goto("/import");

  await page.locator('input[type="file"]').setInputFiles({
    name: "wyciag.csv",
    mimeType: "text/csv",
    buffer: mbankSample,
  });

  // Non-fatal: the review still opens, but a toast surfaces the failed pre-scan.
  await expect(page.getByText(/Nie udało się sprawdzić duplikatów/)).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: /^Zaimportuj \d+ transakc/ })).toBeEnabled();
});
