# Team 3314 — Brochure Website

The public site for FRC Team 3314, the Mechanical Mustangs of Clifton High School.
Built with [Astro](https://astro.build): static HTML output, no client framework —
the only JavaScript shipped is `public/js/site-fx.js` (page transitions, scroll
reveals, stat count-ups, mobile nav, and the mailto contact/join forms).

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
public/js/        site-fx.js
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

**Homepage video** — the YouTube ID lives in the iframe URL in
`src/pages/index.astro` (currently `GxMqA2bpVp8`, appears twice: `embed/<id>`
and `playlist=<id>`).

## Conventions

- Images: resize to ~1600px wide max and compress before adding (big camera
  originals will slow the site down).
- Internal links are root-relative with trailing slashes (`/robots/`), which is
  what the page-transition script in `site-fx.js` keys on.
- Styling is plain CSS classes in `global.css` — no Tailwind, no CSS-in-JS.
