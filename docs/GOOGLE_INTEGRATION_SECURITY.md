# Google integration security and activation

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
or activate any new Gmail features. No credential values were retrieved during
the live audit.

## Changes prepared in the feature branch

- Gmail is disabled unless `GMAIL_INTEGRATION_ENABLED=true` AND a valid
  `GOOGLE_TOKEN_ENCRYPTION_KEY` is installed. Read-only consent is the default.
- Draft saving additionally requires `GMAIL_DRAFTS_ENABLED=true` and separate
  consent. Google's `gmail.compose` scope permits sending as well as draft
  management. Our code never calls send, but token theft could bypass that rule.
- AES-256-GCM encryption uses a random nonce and binds each ciphertext to its
  user and token type. The key lives outside the database. New connections are
  encrypted when the key is present; existing calendar rows are encrypted before
  their next token use. Dormant rows are not proactively migrated by this code.
- Calendar-only legacy rows remain usable during staged deployment without the
  new key. Encrypted rows fail closed if the key is removed or changed.
- Private briefing history uses owner-only staff RLS. Raw Gmail previews and
  calendar events are omitted from saved snapshots. Derived summaries can still
  reveal private details. Scheduled cleanup removes runs older than seven days
  from the active table, not backups or third-party provider systems.
- Only the day-planner provider receives inbox previews. Handoff and delivery
  agents do not. Model instructions cannot execute tools. Draft actions are
  authenticated, staff-only, same-origin, input validated and durably rate limited.
- Email HTML is never rendered; no attachments or full message bodies are read.
  Google readonly permission itself still authorizes reading more than our
  20-preview application filter. Do not present that filter as a security boundary.

## Required before enabling Gmail

1. Complete the production review and normal code deployment. The My Day schema
   migration was applied and verified on 2026-09-24 as
   `20260924110921_daily_operations_agents.sql`, after the independent token
   permission hotfix. Local filenames match the recorded live migration versions.
   Do not repair or delete the live security migration history.
2. Create a base64-encoded 32-byte random encryption key using a trusted local
   secret generator. Store it only in protected server environment variables.
   Back it up securely. Never paste it into chat, job records or the repository.
   Keep Gmail flags false while installing and verifying encryption.
3. Reconnect existing Google accounts or migrate dormant token rows using a
   reviewed server-side task so all tokens are encrypted, not only active rows.
   Verify only aggregate encryption coverage, never print token values.
4. Review and enforce MFA for office accounts and administrative access to
   Google, Vercel, Supabase and GitHub. MFA enrollment/enforcement is NOT
   implemented or verified by this branch. A stolen MFA-authenticated session
   can still expose what the legitimate user can view.
5. Review the Google OAuth consent configuration, Gmail API enablement and
   applicable verification requirements. Use a dedicated operations mailbox and
   calendar when practical to reduce the amount of unrelated personal data at risk.
6. Review AI-provider retention and account settings. OpenAI requests set
   `store:false`; this is not a promise of zero provider retention. A selected
   AI provider receives the supplied previews and business context.
7. Test owner isolation, reconnect/revocation, expired sessions, actual mailbox
   access and a saved draft with a test account. The authenticated production
   Gmail flow has NOT been tested. Browser visual QA remains pending.
8. Only then enable read-only Gmail. Keep draft saving off unless its wider
   permission is needed and explicitly accepted.

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
account, invalidate Ops sessions, disable Gmail flags and scheduled access,
rotate affected hosting/database/provider secrets, and investigate access logs.
Revoking Google access invalidates credentials more effectively than merely
hiding a UI button. Disconnecting the shared Google connection affects calendar
and Gmail together. Deleting local brief history does not erase mailbox data,
Google audit logs, backups or provider retention.

References:
- https://developers.google.com/identity/protocols/oauth2/resources/best-practices
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://supabase.com/docs/guides/database/postgres/column-level-security
- https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

## Rollback

The privilege hotfix is compatible with existing deployed code and should remain
in place even if My Day is rolled back. Do not restore browser access to token
columns. Once encrypted tokens are stored, roll back only to code that supports
decryption, or reconnect accounts after coordinated migration. Removing the key
without planning recovery interrupts calendar sync and availability checks.
