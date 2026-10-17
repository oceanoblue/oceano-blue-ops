# Project receivables and payment migration

`/dashboard/crm/billing` tracks general project invoices separately from the existing real-estate order invoice ledger. Every source invoice has a unique source ID, frozen total, already-paid credit, evidence snapshot and timestamp. Only the unpaid balance is split into remaining installments. Source history is never overwritten when a later payment arrives.

Import starts on hold. Before enabling a payment link, the office must verify the unpaid balance, each agreed due date, and that the source invoice can no longer collect through automatic payments, client links or reminders. Saving reconciliation and approving collection are separate, version-checked operations. Uncertain dates are visible and excluded from past-due totals. A source project date that contradicts its invoice schedule should remain unverified until the agreement is checked.

No automatic charges, email sends, or HoneyBook mutations happen here. Enabling Ops collection does not stop HoneyBook. Do that in the source system and verify it before checking the confirmation. Do not cancel HoneyBook until pending payments, automatic plans, disputes, active project dates, scheduled sessions and files have been reconciled.

Each active installment exposes `/pay/project/[64-character token]`. Stripe Checkout charges exactly its remaining integer-cent balance. A database reservation and fixed Stripe idempotency key reuse the same checkout on retries. Only a signed, paid Stripe event credits an installment. Version/amount/currency/session mismatches hold the invoice and enter the payment-review queue. Payment-completed redirects do not count as evidence of settlement.

Hold collection blocks new checkout reservations, then attempts to expire existing Stripe sessions. A payment already processing may still finish and require office reconciliation. **Reconcile checkouts** repeats that provider verification while collection remains held. Ambiguous requests retain the original reservation, amount, expiration and idempotency key; they must not be deleted and retried with a new key. If provider verification fails, inspect the exact Stripe session or idempotency request and the invoice payment-review row before collecting again. Financial review rows require explicit office reconciliation. Open **Inspect payment** to read the exact live Stripe session, payment intent, captured charge and full refund history. The office can credit only net USD matching the exact remaining installment, or close a review only after Stripe confirms a full successful refund. Pending/truncated refunds, disputes, wrong currencies, test payments and unknown identities stay held. Saving rechecks Stripe, locks the invoice/installment, preserves immutable evidence and still leaves collection held for fresh source/balance review. No refund, charge or email is initiated.

For a later HoneyBook, bank or other external payment, hold collection and expire/reconcile outstanding checkouts first. Record the unique transaction reference, amount, received date and evidence against the correct remaining installment. Confirm that it was not included in the original source credit. The immutable receipt reduces the balance and resets reconciliation/source-stop confirmation so the office checks the source again. Duplicate receipt references and overpayments are rejected.

## Import RPC

Office APIs authenticate active administrators/coordinators and call the service-only `crm_billing_action` function. The same guarded function can be used for a verified migration job:

```
p_action: invoice_create
p_id: a fresh invoice UUID
p_version: null
p_data:
  project_id: existing CRM project UUID
  title: source invoice title
  total_cents: full original invoice total
  source_paid_cents: all money already received as of evidence_checked_at
  source_system: honeybook | ops
  source_id: stable unique invoice or smart-file ID
  source_url: HTTPS invoice reference, without credentials
  evidence: bounded JSON object with the source schedule and payment references
  evidence_checked_at: ISO timestamp
  installments:
    - title: final balance
      amount_cents: unpaid amount only
      due_date: YYYY-MM-DD or null
      due_date_verified: false for any uncertainty
  follow_up_at: optional ISO timestamp for an assigned internal CRM task
```

Installments must sum to `total_cents - source_paid_cents`. A fully paid invoice has no remaining installments. All imports remain held/pending. Project/contact identity must already be verified. A CRM stage being marked completed or archived does not prove an invoice is paid.

## Verification

The PGlite suite executes the migration and validates source credit preservation, immutable evidence, duplicate protection, authorization/grants, due-date and archive holds, stale versions, idempotent settlement, mismatched payment review and later external receipts. Route tests cover office authentication, origin checks, production-only writes and checkout gates. Stripe request tests check the exact remaining amount and reservation idempotency key. Additional tests cover provider identity, captured/live status, pending refunds, exact net credits, full-refund closure, immutable resolution evidence and replayed mismatched sessions. No live charge, refund or client email is made by these tests.

The source-balances panel reads at most 200 pending/active payment observations from the migration audit. It shows only positive integer source figures; zero placeholders and resolved/history observations are excluded. These figures can overlap actual Ops invoices and are never added to receivable or past-due totals. Verify original invoices and source paid credits before creating a native invoice.

## Stripe refund and dispute holds

Signed refund/dispute events are associated using the exact live Stripe Checkout session, PaymentIntent and captured charge. New checkouts put the checkout UUID on both the session and PaymentIntent; older sessions are recovered only through Stripe's exact PaymentIntent session lookup. An immutable provider-identity ledger is saved before automatic settlement. Unknown identities or provider/database failures return a retriable error; unrelated order payments do not enter this project ledger.

A refund/dispute event immediately holds collection, marks the invoice for payment adjustment review, and creates an urgent task assigned to the active project office owner (or an active office administrator/coordinator). Replayed event IDs do not duplicate the ledger or task. Additional events reuse the open task. The recorded gross payment history is preserved: the system does not silently remove credits, create new debt, reopen collection, charge or refund anyone. A refund/dispute detected before a completion event also prevents automatic gross crediting. Public payment pages show “under review”; affected invoices are excluded from receivable totals while their net balance is uncertain.

This is a guarded exception workflow, not automatic refund accounting. The office must inspect the immutable event evidence and live Stripe record, decide the accounting outcome and use a supported financial reconciliation change before removing the provider hold. Ordinary source balance approval cannot clear it. Completing the task or a later dispute-won/refund-failed event does not reopen collection. Already-open Stripe checkouts may still finish; use **Reconcile checkouts** to expire or verify them, keeping collection held.

The office **Check Stripe connection** button checks live provider API access, signing-secret presence and enabled event subscriptions on the canonical `https://app.oceanoblue.net/api/stripe/webhook` endpoint. It returns only health flags and required event names. Administrators can explicitly add missing required events to an existing enabled live canonical endpoint, preserving its other subscriptions, URL and status. It never creates endpoints or rotates secrets. A successful check does not prove a signature-verified webhook has actually been delivered; verify delivery before retiring HoneyBook payments. The check is isolated from preview deployments.
