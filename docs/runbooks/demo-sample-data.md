# Demo sample data: fill, remove and recover

The dedicated demo uses the pinned `jakstoimy-demo.csv` fixture and the normal
bank-import preview and commit RPC. A successful fill contains 96 paid PLN
transactions: income 61,500.00 and expenses 36,765.84. The sample opening anchor
is 5,000.00 at the start of 2026-05-01; the existing cash-position engine then
shows 29,734.16. A pre-existing anchor is preserved.

`finish_demo_sample` verifies the current demo identity and committed import,
then tags its private transactions and records any newly created cash anchor in
`demo_sample_receipts`. A failed or lost response is retryable without another
ledger commit. The receipt is readable only by its owner and is not client-writable.

`clear_demo_sample` removes tagged showcase data and private transactions with
this fixture's import provenance. It refuses sample transactions linked to a
user-created plan or moved to shared scope. It removes a sample-created anchor
only when its recorded ID and update timestamp still match and no other ledger
rows remain. A pre-existing or subsequently edited anchor stays. Committed
import history remains; a deliberate refill creates a new import attempt.

The UI reports success only after cleanup succeeds and a fresh probe finds no
remaining tagged rows. A failed check remains an error; it must not dismiss the
banner or claim that cleanup completed.

## Historical untagged car loan

The retired showcase could create `Demo: Kredyt samochodowy` without `is_demo`
when its later update failed. Both cleanup paths refuse this exact ambiguous
case before deleting anything. The name is a warning, not proof of ownership or
sample origin. Other real records with `Demo:` names must never be swept up.

Inspect only the affected owner's exact plan ID, debt terms, timestamps,
settlement links and available operation evidence. If the origin is conclusively
confirmed, have the owner or an authorized operator mark only that reviewed
record `is_demo=true`, subject to the existing ownership RLS. Then retry the
ordinary cleanup. If evidence is insufficient, preserve the record and report
it for explicit user review. Never repair all rows by prefix or financial values.

The legacy seed creates the car loan already tagged in one transaction. If a
later seed step fails, it attempts tagged-row cleanup; if that cleanup also
fails, it reports failure and leaves identifiable tagged rows for recovery.
No active onboarding surface calls that seed; all sample entry points lead to
the dedicated demo and the CSV flow.

## Regression on a clean test account

1. Fill, confirm 96 transactions, meaningful categories and the persisted cash anchor.
2. Remove, confirm no fixture transactions, demo plans, sample anchor or stale banner.
3. Refill, confirm exactly 96 rows and a second retained committed import attempt.
4. Inject failure after commit but before finalization; reload and retry, without duplicates.
5. Repeat cleanup after editing the anchor or adding unrelated data; preserve those records.
6. Test Demo → Real → Demo and logout, with zero provisioning calls on a saved-session return.

Use a fresh controlled staging account after local checks. Do not retry the
known broken staging fixture before its historical records have been reviewed.
This procedure does not authorize production mutations, deployment or account deletion.
