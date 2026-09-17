# Owner payment alerts

Production runs `/api/cron/payment-alerts` every minute using CRON_SECRET. It derives alerts from confirmed live gallery payments already persisted by the Stripe webhook. Sending notifications is independent of payment processing and never holds up downloads. Preview environments do not claim or send alerts.

Destinations are private rows in `payment_alert_settings` (one email and one SMS), configured outside Git. `enabled_since` is the earliest payment timestamp eligible for alerts. Only nonzero live payments qualify; pending, sandbox and fully discounted orders do not generate money-received alerts. Disable a channel with `enabled=false`. No client gets these owner alerts.

Messages include the amount actually paid, order number, property, and a staff login-protected order link; emails also include the client name and payment timestamp. A payment confirmation is not a bank payout notification.

`payment_alerts` stores one row per order/channel, preserving recipient/content snapshots and provider IDs. Atomic SKIP LOCKED claims prevent concurrent cron runs and repeated Stripe events from sending duplicates. Resend additionally receives an idempotency key. Each run processes up to four messages; larger backlogs take additional minutes.

`accepted` means provider acceptance, not confirmed inbox/handset receipt. `failed` indicates missing configuration/invalid destination. Provider failures or interrupted sends become `needs_review` (stale sends after five minutes). Never reset an ambiguous attempt until the provider is checked; SMS delivery cannot provide an exactly-once guarantee across network failures. After resolving a known unsent attempt, an operator may return that specific row to `pending`. Reconcile email idempotency retention before resending. No automatic replay occurs after a provider attempt.

Settings, history, and the claim RPC are restricted to service_role; neither clients nor staff browser sessions can read private destinations or send alerts. Payment settlement and the Stripe webhook are unchanged.
