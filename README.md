# Team 3314 — Brochure Website

The public site for FRC Team 3314, the Mechanical Mustangs of Clifton High School.
Built with [Astro](https://astro.build): static HTML output, no client framework —
the only JavaScript shipped is `public/js/site-fx.js` (scroll reveals, stat
count-ups, mobile nav, and the mailto contact/join forms) and
`public/js/team-info.js` (the live calendar + documents on the Team Info page).

## Commands

```bash
npm install     # once, after cloning
npm run dev     # local dev server at http://localhost:4321
npm run build   # static production build -> dist/
npm run preview # serve the production build locally
```

Deploy by pointing Netlify / Cloudflare Pages / GitHub Pages at the repo with
build command `npm run build` and output directory `dist`.

## Where things live

```
src/pages/        one .astro file per page (index, about, robots, ...)
src/layouts/      Base.astro — <head>, fonts, skip link, footer, site script
src/components/   Nav, Footer, Marquee, SeasonCard
src/data/         seasons.json, sponsors.json, universities.json, employers.json
src/styles/       global.css — all design tokens and classes
public/assets/    images (already web-optimized)
public/js/        site-fx.js, team-info.js (live calendar + Drive docs)
docs/             updating-team-info.md (teacher guide), adr/ (decision records)
```

## Yearly updates

**Add a robot** — append an entry to `src/data/seasons.json` and drop the photo
in `public/assets/`:

```json
{
  "year": 2027,
  "name": "RobotName",
  "blurb": "One line about the season.",
  "image": "/assets/2027Robot.jpg",
  "alt": "The 2027 robot doing something",
  "tba": "https://www.thebluealliance.com/team/3314/2027"
}
```

Set `"contain": true` if the photo has whitespace/transparent edges and should
letterbox instead of crop (like the 2024 robot). Order in the file = order on
the page (newest first).

**Add or remove a sponsor logo** — edit `src/data/sponsors.json`
(`src`, `alt`, `height` in px to visually balance the logo against the others).
Universities and employers on the About page work the same way.

**Change nav or footer** — edit `src/components/Nav.astro` or `Footer.astro`
once; every page updates.

## Team Info page (`/team-info/`)

The calendar and document list are fetched live in the browser from the
team's public Google Calendar and Google Drive folder (see
`docs/adr/0001-client-side-google-api-for-team-info.md` for why). Day-to-day
updates need **no code changes at all** — events added to the team calendar
and files dropped into the Drive folder appear on the site automatically.
Hand `docs/updating-team-info.md` to whoever maintains the content.

Configuration lives in one place: the CONFIG block at the top of
`public/js/team-info.js` (`API_KEY`, `CALENDAR_ID`, `FOLDER_ID`). The same
calendar/folder IDs also appear in the frontmatter of
`src/pages/team-info.astro` for the "open in Google" links.

One-time Google setup (as admin@frc3314.com):

1. The calendar must be public: calendar Settings → "Access permissions" →
   **Make available to public** (see all event details).
2. The Drive folder must be shared **Anyone with the link — Viewer**.
3. API key: at [console.cloud.google.com](https://console.cloud.google.com)
   create a project, enable **Google Calendar API** and **Google Drive API**
   (APIs & Services → Library), then Credentials → **Create credentials →
   API key**. Restrict it: Application restrictions → Websites →
   `https://frc3314.com/*`, `https://*.frc3314.com/*`, and
   `http://localhost:4321/*`; API restrictions → only the two APIs above.
   Paste the key into `API_KEY` in `public/js/team-info.js`. The key is
   public by design — the restrictions are what keep it safe.

If the key is missing or a fetch fails, the page degrades to direct
"open in Google Calendar / browse the folder" links instead of breaking.

The quick-info block (meeting times, room, channels) is static HTML in
`src/pages/team-info.astro` — look for the `PLACEHOLDER` comments.

**Homepage video** — the YouTube ID lives in the iframe URL in
`src/pages/index.astro` (currently `GxMqA2bpVp8`, appears twice: `embed/<id>`
and `playlist=<id>`).

## Conventions

- Images: resize to ~1600px wide max and compress before adding (big camera
  originals will slow the site down).
- Internal links are root-relative with trailing slashes (`/robots/`) for URL
  consistency. Page navigations crossfade via native CSS view transitions
  (`@view-transition` in `global.css`) — no JS involved.
- Styling is plain CSS classes in `global.css` — no Tailwind, no CSS-in-JS.
