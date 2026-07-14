# Protected documents go through a Netlify Function, not client-side JS

The Team Info page gained a password-gated "Team-only documents" section.
Unlike the public calendar/documents (ADR 0001), this one is served by a
Netlify Function (`netlify/functions/docs.mjs` at `/api/docs`): the function
checks the team password, lists a private Drive folder through a Google
service account, and proxies every file download. The private folder is not
link-shared at all — the service account is the only outside identity with
access — so possession of a file URL grants nothing without an unlocked
session (an HttpOnly, SameSite=Strict cookie holding a signed, expiring
token derived from the password).

## Considered Options

- **Client-side password with AES-encrypted folder ID** — no backend; the
  private folder's ID ships encrypted with a key derived from the password,
  so the source reveals nothing. But the folder itself must stay "anyone
  with the link", so any forwarded file link is permanently public. Was
  briefly implemented, then replaced by this ADR's approach when real access
  control was requested.
- **Netlify's built-in password protection** — gates the whole site (or a
  deploy context), not one section, and is a paid-tier feature.
- **Netlify Function + service account (chosen)** — files are genuinely
  private to Drive; the password and folder ID live in Netlify environment
  variables (`DOCS_PASSWORD`, `DOCS_FOLDER_ID`, `GOOGLE_SERVICE_ACCOUNT`);
  rotating the password invalidates all sessions since the token secret is
  derived from it. Costs: a serverless dependency in an otherwise static
  site, and Google-native files arrive as PDF exports rather than live docs.

## Consequences

- Native Google files (Docs/Sheets/Slides/Drawings) are exported as PDF by
  the proxy; Google Forms can't be proxied and are filtered out of the
  listing — forms belong in the public folder.
- The function only serves files whose parent chain reaches the private
  folder (one subfolder level, matching what the listing shows), so a
  session cookie can't be used to read anything else the service account
  might someday access.
- `astro dev` can't run functions; `scripts/docs-dev.mjs` serves the real
  function locally (with `--mock`, against a fake Drive) and proxies page
  requests to the Astro dev server.
- The protection ceiling is the shared password itself: anyone who knows it
  sees the files, so truly sensitive personal data still stays off the site.
