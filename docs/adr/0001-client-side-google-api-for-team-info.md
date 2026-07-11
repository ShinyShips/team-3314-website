# Team Info page renders live Google data client-side

Everything else on this site is repo-committed content (JSON in `src/data/`,
static HTML at build time), but the Team Info page's calendar and document
list are fetched in the browser from the Google Calendar and Drive APIs using
a public, referrer-restricted API key. We chose this because the page's whole
point is that a non-technical teacher updates it by adding events to the Team
Calendar or dropping files into the Team Documents folder — with no rebuild,
no deploy, and no one touching the repo.

## Considered Options

- **Google's embed iframes** (`embeddedfolderview`, calendar embed) — zero
  code, but visually clash with the site, unstyleable, poor on mobile, and
  the folder view is an undocumented endpoint.
- **Build-time fetch via Drive/Calendar APIs** — matches the site's static
  philosophy, but new uploads/events would not appear until the next deploy,
  defeating the "teacher uploads and it just appears" requirement (or forcing
  scheduled rebuilds).
- **Client-side fetch (chosen)** — live updates, site-native styling, plain
  JS consistent with the no-framework convention. The API key is exposed in
  page source by design; it can only read already-public data and is
  restricted in the Google console to frc3314.com referrers and the two APIs.

## Consequences

- The Team Calendar and Team Documents folder must remain publicly readable
  ("anyone with the link"), so nothing containing personal data may go in
  them.
- If Google's APIs are unreachable, the page degrades to direct links to the
  calendar and folder rather than rendering nothing.
- Both resources are owned by the team's Google Workspace (not a personal or
  school-district account) so public sharing works and ownership survives
  staff turnover.
