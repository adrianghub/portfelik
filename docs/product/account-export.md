# Informational account export

The Settings export is an understandable JSON snapshot, not a restore archive.
It includes financial truth and durable user decisions visible to the account.
Secrets, raw bank-review payloads, delivery state, security telemetry, and
dismissed suggestions are intentionally omitted.

`ACCOUNT_EXPORT_TABLE_INVENTORY` in
`apps/web-svelte/src/lib/services/account-export.ts` is the executable source of
truth. A unit test derives the final public-table set from ordered migrations and
fails whenever a table is created without an export classification.

## Inventory

| Table                              | Classification | Export field / reason                                                       |
| ---------------------------------- | -------------- | --------------------------------------------------------------------------- |
| `profiles`                         | Exported       | `profile`                                                                   |
| `user_groups`                      | Exported       | `groups`                                                                    |
| `group_members`                    | Exported       | `group_members`                                                             |
| `categories`                       | Exported       | `categories`                                                                |
| `transactions`                     | Exported       | `transactions`                                                              |
| `bank_accounts`                    | Exported       | `bank_accounts`                                                             |
| `transaction_import_sessions`      | Exported       | `import_sessions`                                                           |
| `categorization_rules`             | Exported       | `categorization_rules`                                                      |
| `plans`                            | Exported       | `plans`                                                                     |
| `plan_transaction_links`           | Exported       | `plan_transaction_links`                                                    |
| `plan_debt_terms`                  | Exported       | `plan_debt_terms`                                                           |
| `plan_progress_snapshots`          | Exported       | `plan_progress_snapshots`                                                   |
| `cash_positions`                   | Exported       | Private owner rows in `cash_positions`; unsupported group cash is excluded. |
| `financial_snapshots`              | Exported       | `financial_snapshot`                                                        |
| `net_worth_items`                  | Exported       | `net_worth_items`                                                           |
| `recurring_occurrence_skips`       | Exported       | `recurring_occurrence_skips`                                                |
| `group_invitations`                | Omitted        | Pending access workflow, not finance.                                       |
| `group_invitation_tokens`          | Omitted        | Hashed access-token workflow.                                               |
| `transaction_import_rows`          | Omitted        | Raw statement review payload.                                               |
| `transaction_import_links`         | Omitted        | Internal deduplication hashes and provenance.                               |
| `push_subscriptions`               | Omitted        | Device secret and delivery metadata.                                        |
| `notifications`                    | Ephemeral      | Delivery inbox, not financial truth.                                        |
| `plan_settlement_dismissals`       | Ephemeral      | Suggestion preference, not plan progress.                                   |
| `action_dismissals`                | Ephemeral      | Attention preference.                                                       |
| `group_invitation_access_attempts` | Ephemeral      | Security rate-limit telemetry.                                              |

Group-scoped financial rows are household history and may be visible in the
export through RLS. Bank provenance remains private. The export must not call
itself “full” or imply that it can restore an account.
