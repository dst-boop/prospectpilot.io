# LinkedIn account connection
Implemented authenticated /settings/linkedin, linked from Research. Connect opens LinkedIn's consent screen; callback stores an encrypted member access token. Status shows account name and actual expiry. Reconnect repeats consent. Disconnect deletes local credentials and pending authorization; users can separately remove the permission grant in LinkedIn settings. No raw-token viewer or copy button, refresh-token storage, arbitrary member lookup, or posting permissions.

## Activation
1. In LinkedIn Developers, create/select your application and enable **Sign In with LinkedIn using OpenID Connect**.
2. Register exactly https://lead-qualifier-505002.web.app/auth/linkedin/callback (or your canonical configured website). The connection must start on the same origin. Existing Firebase Google sign-in remains required.
3. Set Cloud Run LINKEDIN_CLIENT_ID and LINKEDIN_REDIRECT_URI. Store LINKEDIN_CLIENT_SECRET and LINKEDIN_TOKEN_KEY in Secret Manager and mount them as environment variables for the service. LINKEDIN_TOKEN_KEY must be a cryptographically random 32-byte key encoded as base64. Generate it with a secure random generator; do not put it in source control or browser code. Preserve the key across deployments. Rotation requires disconnect/reconnect or an explicit re-encryption migration.
4. Run the existing release pipeline, including migration 003. The migration job does not need LinkedIn secrets. The runtime identity needs access to the two configured secrets.
5. Open /research → LinkedIn connection → Connect LinkedIn. Sign in and consent at LinkedIn. Verify the returned account and expiry. Test disconnect and confirm the saved connection disappears.

Without configuration the page clearly shows setup required; it never simulates a connection. Live LinkedIn authorization requires real developer credentials and has not been verified by local mocked tests.

## Security and lifecycle
Owner-authorized Firebase sessions protect all routes; same-origin POSTs protect mutations. Authorization state is cryptographically random, hashed, tied to the exact authenticated session, expires after ten minutes, and is consumed transactionally. One pending request per user prevents unbounded state accumulation. Credentials are AES-256-GCM encrypted with the user ID bound as authenticated data. SQL uses parameters. Provider responses are limited to 64 KB and timed out. The token is never returned to the browser. The linked member profile comes from the bearer-authenticated userinfo endpoint; ID tokens are not used to authenticate app users. Reconnect replaces credentials only after successful profile validation. Failed attempts preserve the existing connection. Expired rows retain encrypted tokens until replacement/deletion; expiry is clearly shown and no API usage of expired tokens is implemented.

References:
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
- https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
