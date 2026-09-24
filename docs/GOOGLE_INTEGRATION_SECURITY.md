# Google Calendar integration security

No integration is completely secure. Access is bounded by which credential or
system is compromised; feature-level filters are not Google authorization limits.

## Verified live fix, 2026-09-24

Read-only inspection of project `hcxqqbnoextequclrvff` found that the existing
calendar table allowed authenticated owners to select their Google access and
refresh tokens, and admin sessions to select tokens for other owners. RLS was
enabled and restricted rows; this was not evidence of anonymous token exposure
or of an actual breach.

Migration `20260924095719_protect_google_credentials.sql` was applied as a focused
security hotfix through the authorized Supabase connection after a PGlite
permission test. The local migration version matches the recorded live version.
It changes privileges only and preserves existing server calendar workflows.
Post-change metadata checks confirmed:

| Role | Token columns | Connection health | Writes |
| --- | --- | --- | --- |
| anon | denied | denied | denied |
| authenticated | denied | existing owner/admin RLS | denied |
| service_role | allowed | allowed | allowed |

All repository reads/writes of the secret columns use the server admin client.
Existing UI queries use explicit metadata columns and remain supported. This
hotfix does not encrypt existing token values, rotate previously issued tokens,
or grant mailbox access. No credential values were retrieved during
the live audit.

## Gmail removal, 2026-09-24

Gmail was removed at the owner's request: no inbox UI, Gmail API client,
mailbox draft action, reply-generation endpoint, Gmail OAuth scope request, or
Gmail feature flags remain. Editor templates are copy-only. Old mailbox action
requests and email consent links return 410 Gone without accessing credentials.
The calendar consent flow excludes previously granted unrelated scopes.

A metadata-only production query found one active Google connection and zero
connections with Gmail scopes. No token values were read or revoked; the existing
calendar connection is preserved. No database migration is required for removal.
The separate Gmail connection in the Claude application is unaffected.

## Calendar protections

- AES-256-GCM encryption uses a random nonce and binds each ciphertext to its
  user and token type. The key lives outside the database. New connections are
  encrypted when the key is present; existing calendar rows are encrypted before
  their next token use. Dormant rows are not proactively migrated by this code.
- Calendar-only legacy rows remain usable during staged deployment without the
  new key. Encrypted rows fail closed if the key is removed or changed.
- Private briefing history uses owner-only staff RLS. Raw calendar events are
  omitted from saved snapshots. Derived summaries can still reveal private details.
  Scheduled cleanup removes runs older than seven days from the active table,
  not backups or third-party provider systems.
- Model input is explicitly limited to calendar and production fields. Assistants
  have no tools and cannot execute instructions embedded in calendar or job text.

## Remaining calendar hardening

The encryption key rollout and MFA enforcement have not been verified. Store a
base64-encoded 32-byte random `GOOGLE_TOKEN_ENCRYPTION_KEY` only in protected server
environment variables and back it up securely. Never paste it into chat or source.
Migrate dormant credentials through a reviewed server task or reconnect accounts;
verify aggregate encryption coverage without printing credentials. Review MFA for
Ops, Google, hosting, database, and repository access. Review provider retention:
OpenAI `store:false` is not a promise of zero retention.

## Residual risks and incident response

- A stolen Ops session may expose that user's visible brief and connected data.
- A database-only breach can expose saved summaries and any unencrypted legacy
  tokens; encrypted tokens require the separately held key.
- A service-role compromise may read database records. A server or hosting
  compromise that also exposes the encryption key can use Google credentials.
- RLS and application encryption do not establish that the whole platform is
  secure. The Supabase advisor also reported an existing `field_orders`
  SECURITY DEFINER view and publicly callable definer functions. These findings
  require separate contextual review; they are not proven exploits and were not
  changed by this integration work.

If compromise is suspected, revoke the app's Google access from the Google
account, invalidate Ops sessions, disable scheduled access,
rotate affected hosting/database/provider secrets, and investigate access logs.
Revoking Google access invalidates credentials more effectively than merely
hiding a UI button. Disconnecting Google affects calendar scheduling and availability. Deleting local brief history does not erase mailbox data,
Google audit logs, backups or provider retention.

References:
- https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- https://supabase.com/docs/guides/database/postgres/column-level-security
- https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

## Rollback

The privilege hotfix is compatible with existing deployed code and should remain
in place even if My Day is rolled back. Do not restore browser access to token
columns. Once encrypted tokens are stored, roll back only to code that supports
decryption, or reconnect accounts after coordinated migration. Removing the key
without planning recovery interrupts calendar sync and availability checks.
